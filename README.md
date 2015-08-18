phosphor-messaging
==================

A module for inter-object message passing.

[API Docs](http://phosphorjs.github.io/phosphor-messaging/)


Package Install
---------------

**Prerequisites**
- [node](http://nodejs.org/)

```bash
npm install --save phosphor-messaging
```


Source Build
------------

**Prerequisites**
- [git](http://git-scm.com/)
- [node](http://nodejs.org/)

```bash
git clone https://github.com/phosphorjs/phosphor-messaging.git
cd phosphor-messaging
npm install
```

**Rebuild**
```bash
npm run clean
npm run build
```


Run Tests
---------

Follow the source build instructions first.

```bash
npm test
```


Build Docs
----------

Follow the source build instructions first.

```bash
npm run docs
```

Navigate to `docs/index.html`.


Supported Runtimes
------------------

The runtime versions which are currently *known to work* are listed below.
Earlier versions may also work, but come with no guarantees.

- Node 0.12.7+
- IE 11+
- Firefox 32+
- Chrome 38+


Usage Examples
--------------

**Note:** This module is fully compatible with Node/Babel/ES6/ES5. Simply
omit the type declarations when using a language other than TypeScript.

**The simplest case is sending a message to a message handler:**

The `sendMessage` function delivers the messages synchronously, for
immediate processing by the message handler.

```typescript
// Omit the `IMessageHandler` import on Node/Babel/ES6/ES5
import { IMessageHandler, sendMessage } from 'phosphor-messaging';

class Handler implements IMessageHandler {
  /**
   * Process a message delivered to the handler.
   */
  processMessage(msg: Message): void {
    console.log(msg.type);
  }
}

var handler = new Handler();
sendMessage(handler, new Message('one'));    // logs 'one'
sendMessage(handler, new Message('two'));	 // logs 'two'
sendMessage(handler, new Message('three'));  // logs 'three'
```

**It's also possible to post a message for future processing:**

The `postMessage` function delivers the messages asynchronously, for
processing by the message handler on the next event loop cycle.

```typescript
import { postMessage } from 'phosphor-messaging';

postMessage(handler, new Message('one'));
postMessage(handler, new Message('two'));
postMessage(handler, new Message('three'));

// later, logs 'one', 'two', then 'three'.
```
