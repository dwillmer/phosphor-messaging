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
import { IMessageHandler, Message, sendMessage } from 'phosphor-messaging';

class Handler implements IMessageHandler {

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
processing by the message handler on the next cycle of the event loop.

```typescript
import { postMessage } from 'phosphor-messaging';

postMessage(handler, new Message('one'));
postMessage(handler, new Message('two'));
postMessage(handler, new Message('three'));

// sometime later: logs 'one', 'two', then 'three'.
```

**Custom messages can be defined with extra data:**

```typescript
class ValueMessage extends Message {

  constructor(value: number) {
    super('value');
    this._value = value;
  }

  get value(): number {
    return this._value;
  }

  private _value: number;
}


class ValueHandler extends Handler {

  processMessage(msg: Message): void {
    if (msg.type === 'value') {
      console.log('value: ', (<ValueMessage>msg).value);
    } else {
      super.processMessage(msg);
    }
  }
}


var handler = new ValueHandler();
sendMessage(handler, new Message('one'));    // logs 'one'
postMessage(handler, new Message('two'));
sendMessage(handler, new ValueMessage(42));  // logs 42
postMessage(handler, new ValueMessage(43));

// sometime later: logs 'two' then 43
```

**Posted messages can be compressed to reduce duplicate work:**

```typescript
import { Queue } from 'phosphor-queue';


class ExpensiveWorker extends Handler {

  processMessage(msg: Message): void {
    if (msg.type === 'expensive') {
      console.log('do something expensive');
    } else {
      super.processMessage(msg);
    }
  }

  compressMessage(msg: Message, pending: Queue<Message>): boolean {
    if (msg.type === 'expensive') {
       return pending.some(other => other.type === 'expensive');
    }
    return false;
  }
}


var handler = new ExpensiveWorker();
postMessage(handler, new Message('one'));
postMessage(handler, new Message('expensive'));
postMessage(handler, new Message('two'));
postMessage(handler, new Message('expensive'));
postMessage(handler, new Message('expensive'));
postMessage(handler, new Message('three'));
postMessage(handler, new Message('expensive'));

// sometime later: logs 'one', 'do something expensive', 'two', then 'three'
```

**It's possible to test for and preemptively deliver posted messages:**

```typescript
import { hasPendingMessages, sendPendingMessage } from 'phosphor-messaging';

postMessage(handler, new Message('one'));
postMessage(handler, new Message('two'));
postMessage(handler, new Message('three'));

hasPendingMessages(handler);  // true

sendPendingMessage(handler);  // logs 'one'
sendPendingMessage(handler);  // logs 'two'

// sometime later: logs 'three'.
```
