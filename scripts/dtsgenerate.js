require('dts-generator').generate({
  name: 'phosphor-messaging',
  main: 'phosphor-messaging/index',
  baseDir: 'lib',
  files: ['index.d.ts'],
  out: 'lib/phosphor-messaging.d.ts',
  target: 1 // ts.ScriptTarget.ES5
});
