let common = [
    'features/**/*.feature',
    '--require-module ts-node/register', //typescript cucumber
    '--require ./features/step_definitions/**/*.ts',
    '--require ./features/support/**/*.ts',
    '--format progress-bar',
    `--format-options '{"snippetInterface": "synchronous"}'`,
].join(' ');

module.exports = {
    default: common
}
