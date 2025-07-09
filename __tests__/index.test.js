const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

test('index.html parses without JavaScript errors', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (e) => errors.push(e));

  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.requestAnimationFrame = () => {};
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  dom.window.close();

  expect(errors).toHaveLength(0);
});
