<?php
/**
 * Copyright 2018 Pinterest, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Lints JavaScript and JSX files using Prettier & Eslint auto-fix
 */
final class PrettierESLintLinter extends ArcanistExternalLinter {
  private $cwd = '';
  private $flags = array();

  public function getInfoName() {
    return 'PrettierESLint';
  }

  public function getInfoURI() {
    return 'https://github.com/prettier/prettier-eslint-cli';
  }

  public function getInfoDescription() {
    return pht('A combo Prettier formatter & Eslint auto-fix linter');
  }

  public function getLinterName() {
    return 'PRETTIERESLINT';
  }

  public function getLinterConfigurationName() {
    return 'prettier-eslint';
  }

  public function shouldUseInterpreter() {
    return true;
  }

  public function getDefaultInterpreter() {
    list($err, $stdout, $stderr) = exec_manual('node -v');
    preg_match('/^v([^\.]+)\..*$/', $stdout, $m);
    if (empty($m)) {
      // Copied from arcanist/master/src/lint/linter/ArcanistExternalLinter.php
      throw new ArcanistMissingLinterException(
        pht(
          'Unable to locate interpreter "%s" to run linter %s. You may need '.
          'to install the interpreter, or adjust your linter configuration.',
          'node',
          get_class($this)));
    }
    if ((int)$m[1] < 6) {
      // Only used for node < 6
      return __DIR__ . '/node4_proxy';
    }
    return 'node';
  }

  public function getDefaultBinary() {
    list($err, $stdout, $stderr) = exec_manual('yarn -s --cwd %s bin', $this->getProjectRoot() . '/' . $this->cwd);
    if (empty($stdout)) {
      // Copied from arcanist/master/src/lint/linter/ArcanistExternalLinter.php
      throw new ArcanistMissingLinterException(
        sprintf(
          "%s\n%s",
          pht(
            'Unable to locate script "%s" to run linter %s. You may need '.
            'to install the script, or adjust your linter configuration.',
            'yarn@1',
            get_class($this)),
            pht(
              'TO INSTALL: %s',
              $this->getInstallInstructions())));
    }
    $binaryPath = strtok($stdout, "\n");
    return $binaryPath . "/prettier-eslint";
  }

  public function getVersion() {
    list($err, $stdout, $stderr) = exec_manual('%C -v', $this->getExecutableCommand());
    return $stdout;
  }

  protected function getMandatoryFlags() {
    return array(
      '--log-level=silent',
    );
  }

  public function getLinterConfigurationOptions() {
    $options = array(
      'prettier-eslint.cwd' => array(
        'type' => 'optional string',
        'help' => pht('Specify a project sub-directory for both the local prettier-eslint-cli install and the sub-directory to lint within.'),
      ),
    );
    return $options + parent::getLinterConfigurationOptions();
  }

  public function setLinterConfigurationValue($key, $value) {
    switch ($key) {
      case 'prettier-eslint.cwd':
        $this->cwd = $value;
        return;
    }
    return parent::setLinterConfigurationValue($key, $value);
  }

  public function getInstallInstructions() {
    return pht(
      'run `%s` to install yarn@1 globally (needed for specifying --cwd), and `%s` to add prettier-eslint-cli to your project (configurable at prettier-eslint.cwd).',
      'npm install --global yarn@1',
      'yarn add --dev prettier-eslint-cli'
    );
  }

  protected function parseLinterOutput($path, $err, $stdout, $stderr) {
    if ($err) {
      return false;
    }

    $originalText = $this->getData($path);
    $messages = array();

    // Note: $stdout is empty for ignored files
    if ($stdout && $stdout != $originalText) {
      $message = new ArcanistLintMessage();
      $message->setPath($path);
      $message->setSeverity(ArcanistLintSeverity::SEVERITY_AUTOFIX);
      $message->setName('Prettier-Eslint Format');
      $message->setLine(1);
      $message->setCode($this->getLinterName());
      $message->setChar(1);
      $message->setDescription('Your file has not been prettier-eslint-ified');
      $message->setOriginalText($originalText);
      $message->setReplacementText($stdout);
      $messages[] = $message;
    }

    return $messages;
  }
}
