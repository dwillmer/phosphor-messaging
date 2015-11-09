/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import expect = require('expect.js');

import {
  Queue
} from 'phosphor-queue';

import {
  IMessageFilter, IMessageHandler, Message, clearMessageData,
  hasPendingMessages, installMessageFilter, postMessage, removeMessageFilter,
  sendMessage, sendPendingMessage
} from '../../lib/index';


class Handler implements IMessageHandler {

  messages: string[] = [];

  processMessage(msg: Message): void {
    this.messages.push(msg.type);
  }
}


class CompressHandler extends Handler {

  compressTypes: string[] = [];

  compressMessage(msg: Message, pending: Queue<Message>): boolean {
    if (this.compressTypes.indexOf(msg.type) !== -1) {
      return pending.some(other => other.type === msg.type);
    }
    return false;
  }
}


class GlobalHandler extends Handler {

  static messages: string[] = [];

  processMessage(msg: Message): void {
    super.processMessage(msg);
    GlobalHandler.messages.push(msg.type);
  }
}


class Filter implements IMessageFilter {

  filterTypes: string[] = [];

  messages: string[] = [];

  handlers: IMessageHandler[] = [];

  filterMessage(handler: IMessageHandler, msg: Message): boolean {
    this.messages.push(msg.type);
    this.handlers.push(handler);
    return this.filterTypes.indexOf(msg.type) !== -1;
  }
}


class RemovingFilter extends Filter {

  filterMessage(handler: IMessageHandler, msg: Message): boolean {
    let result = super.filterMessage(handler, msg);
    removeMessageFilter(handler, this);
    return result;
  }
}


// browser/node compatible raf
let raf: (cb: () => void) => any;
if (typeof requestAnimationFrame === 'function') {
  raf = requestAnimationFrame;
} else {
  raf = setImmediate;
}


describe('phosphor-messaging', () => {

  describe('Message', () => {

    describe('#constructor()', () => {

      it('should require a single message type argument', () => {
        let msg = new Message('test');
        expect(msg instanceof Message).to.be(true);
      });

    });

    describe('#type', () => {

      it('should return the message type', () => {
        let msg = new Message('test');
        expect(msg.type).to.be('test');
      });

      it('should be read only', () => {
        let msg = new Message('test');
        expect(() => { msg.type = 'other' }).to.throwException();
      });

    });

  });

  describe('IMessageHandler', () => {

    describe('#processMessage()', () => {

      it('should process the messages delivered to the handler', () => {
        let handler = new Handler();
        sendMessage(handler, new Message('one'));
        sendMessage(handler, new Message('two'));
        sendMessage(handler, new Message('three'));
        expect(handler.messages).to.eql(['one', 'two', 'three']);
      });

    });

    describe('#compressMessage()', () => {

      it('should be optional to implement', (done) => {
        let handler = new Handler();
        postMessage(handler, new Message('one'));
        expect(handler.messages).to.eql([]);
        raf(() => {
          expect(handler.messages).to.eql(['one']);
          done();
        });
      });

      it('should compress desired messages posted to the handler', (done) => {
        let handler = new CompressHandler();
        handler.compressTypes = ['one', 'three'];
        postMessage(handler, new Message('one'));
        postMessage(handler, new Message('two'));
        postMessage(handler, new Message('three'));
        postMessage(handler, new Message('one'));
        postMessage(handler, new Message('two'));
        postMessage(handler, new Message('three'));
        postMessage(handler, new Message('one'));
        postMessage(handler, new Message('two'));
        postMessage(handler, new Message('three'));
        raf(() => {
          expect(handler.messages).to.eql(['one', 'two', 'three', 'two', 'two']);
          done();
        });
      });

      it('should not be called for sent messages', () => {
        let handler = new CompressHandler();
        handler.compressTypes = ['one'];
        sendMessage(handler, new Message('one'));
        sendMessage(handler, new Message('one'));
        sendMessage(handler, new Message('one'));
        sendMessage(handler, new Message('one'));
        expect(handler.messages).to.eql(['one', 'one', 'one', 'one']);
      });

    });

  });

  describe('IMessageFilter', () => {

    describe('#filterMessage()', () => {

      it('should be called for every message delivered to a handler', () => {
        let handler = new Handler();
        let filter = new Filter();
        installMessageFilter(handler, filter);
        sendMessage(handler, new Message('one'));
        sendMessage(handler, new Message('two'));
        sendMessage(handler, new Message('three'));
        expect(handler.messages).to.eql(['one', 'two', 'three']);
        expect(filter.messages).to.eql(['one', 'two', 'three']);
        expect(filter.handlers).to.eql([handler, handler, handler]);
      });

      it('should filter desired messages for a handler', () => {
        let handler1 = new Handler();
        let handler2 = new Handler();
        let filter = new Filter();
        filter.filterTypes = ['one', 'two'];
        installMessageFilter(handler1, filter);
        installMessageFilter(handler2, filter);
        sendMessage(handler1, new Message('one'));
        sendMessage(handler2, new Message('one'));
        sendMessage(handler1, new Message('two'));
        sendMessage(handler2, new Message('two'));
        sendMessage(handler1, new Message('three'));
        sendMessage(handler2, new Message('three'));
        expect(handler1.messages).to.eql(['three']);
        expect(handler2.messages).to.eql(['three']);
        expect(filter.messages).to.eql(['one', 'one', 'two', 'two', 'three', 'three']);
        expect(filter.handlers).to.eql([handler1, handler2, handler1, handler2, handler1, handler2]);
      });

    });

  });

  describe('sendMessage()', () => {

    it('should send a message to the handler to process immediately', () => {
      let handler = new Handler();
      expect(handler.messages).to.eql([]);
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql(['one']);
      sendMessage(handler, new Message('two'));
      expect(handler.messages).to.eql(['one', 'two']);
    });

    it('should not allow the handler to compress the message', () => {
      let handler = new CompressHandler();
      handler.compressTypes = ['one'];
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql(['one', 'one', 'one']);
    });

    it('should first run the message through the event filters', () => {
      let handler = new Handler();
      let filter1 = new Filter();
      let filter2 = new Filter();
      filter1.filterTypes = ['one'];
      filter2.filterTypes = ['two'];
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter2);
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('two'));
      sendMessage(handler, new Message('three'));
      expect(handler.messages).to.eql(['three']);
      expect(filter1.messages).to.eql(['one', 'three']);
      expect(filter2.messages).to.eql(['one', 'two', 'three']);
    });

    it('should stop filtering on the first `true` filter result', () => {
      let handler = new Handler();
      let filter1 = new Filter();
      let filter2 = new Filter();
      let filter3 = new Filter();
      filter1.filterTypes = ['one'];
      filter2.filterTypes = ['one'];
      filter3.filterTypes = ['one'];
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter3);
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('two'));
      sendMessage(handler, new Message('three'));
      expect(handler.messages).to.eql(['two', 'three']);
      expect(filter1.messages).to.eql(['two', 'three']);
      expect(filter2.messages).to.eql(['two', 'three']);
      expect(filter3.messages).to.eql(['one', 'two', 'three']);
    });

  });

  describe('postMessage()', () => {

    it('should post a message to the handler in the future', (done) => {
      let handler = new Handler();
      expect(handler.messages).to.eql([]);
      postMessage(handler, new Message('one'));
      postMessage(handler, new Message('two'));
      postMessage(handler, new Message('three'));
      expect(handler.messages).to.eql([]);
      raf(() => {
        expect(handler.messages).to.eql(['one', 'two', 'three']);
        done();
      });
    });

    it('should allow the handler to compress the message', (done) => {
      let handler = new CompressHandler();
      handler.compressTypes = ['three'];
      expect(handler.messages).to.eql([]);
      postMessage(handler, new Message('one'));
      postMessage(handler, new Message('two'));
      postMessage(handler, new Message('three'));
      postMessage(handler, new Message('three'));
      postMessage(handler, new Message('three'));
      postMessage(handler, new Message('three'));
      expect(handler.messages).to.eql([]);
      raf(() => {
        expect(handler.messages).to.eql(['one', 'two', 'three']);
        done();
      });
    });

    it('should obey global order of posted messages', (done) => {
      let handler1 = new GlobalHandler();
      let handler2 = new GlobalHandler();
      let handler3 = new GlobalHandler();
      postMessage(handler3, new Message('one'));
      postMessage(handler1, new Message('two'));
      postMessage(handler2, new Message('three'));
      postMessage(handler1, new Message('A'));
      postMessage(handler2, new Message('B'));
      postMessage(handler3, new Message('C'));
      expect(handler1.messages).to.eql([]);
      expect(handler2.messages).to.eql([]);
      expect(handler3.messages).to.eql([]);
      expect(GlobalHandler.messages).to.eql([]);
      raf(() => {
        expect(GlobalHandler.messages).to.eql(['one', 'two', 'three', 'A', 'B', 'C']);
        expect(handler1.messages).to.eql(['two', 'A']);
        expect(handler2.messages).to.eql(['three', 'B']);
        expect(handler3.messages).to.eql(['one', 'C']);
        done();
      });
    });

  });

  describe('hasPendingMessages()', () => {

    it('should indicate if a handler has pending posted messages', (done) => {
      let handler1 = new Handler();
      let handler2 = new Handler();
      let handler3 = new Handler();
      expect(hasPendingMessages(handler1)).to.be(false);
      expect(hasPendingMessages(handler2)).to.be(false);
      expect(hasPendingMessages(handler3)).to.be(false);
      postMessage(handler1, new Message('one'));
      postMessage(handler2, new Message('two'));
      expect(hasPendingMessages(handler1)).to.be(true);
      expect(hasPendingMessages(handler2)).to.be(true);
      expect(hasPendingMessages(handler3)).to.be(false);
      raf(() => {
        expect(hasPendingMessages(handler1)).to.be(false);
        expect(hasPendingMessages(handler2)).to.be(false);
        expect(hasPendingMessages(handler3)).to.be(false);
        done();
      });
    });

  });

  describe('sendPendingMessage()', () => {

    it('should send the first pending posted message to a handler', (done) => {
      let handler = new Handler();
      expect(handler.messages).to.eql([]);
      postMessage(handler, new Message('one'));
      postMessage(handler, new Message('two'));
      postMessage(handler, new Message('three'));
      expect(handler.messages).to.eql([]);
      sendPendingMessage(handler);
      expect(handler.messages).to.eql(['one']);
      sendPendingMessage(handler);
      expect(handler.messages).to.eql(['one', 'two']);
      raf(() => {
        expect(handler.messages).to.eql(['one', 'two', 'three']);
        done();
      });
    });

    it('should be a no-op if a handler has no pending messages', () => {
      let handler = new Handler();
      expect(handler.messages).to.eql([]);
      sendPendingMessage(handler);
      expect(handler.messages).to.eql([]);
    });

  });

  describe('installMessageFilter()', () => {

    it('should install a filter for a handler', () => {
      let handler = new Handler();
      let filter = new Filter();
      filter.filterTypes = ['one'];
      installMessageFilter(handler, filter);
      expect(handler.messages).to.eql([]);
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql([]);
    });

    it('should install a new filter in front of any others', () => {
      let handler = new Handler();
      let filter1 = new Filter();
      let filter2 = new Filter();
      filter1.filterTypes = ['one'];
      filter2.filterTypes = ['two'];
      installMessageFilter(handler, filter1);
      sendMessage(handler, new Message('two'));
      installMessageFilter(handler, filter2);
      sendMessage(handler, new Message('two'));
      sendMessage(handler, new Message('two'));
      sendMessage(handler, new Message('three'));
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql(['two', 'three']);
      expect(filter1.messages).to.eql(['two', 'three', 'one']);
      expect(filter2.messages).to.eql(['two', 'two', 'three', 'one']);
    });

    it('should allow a filter to be installed multiple times', () => {
      let handler = new Handler();
      let filter1 = new Filter();
      let filter2 = new Filter();
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter1);
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('two'));
      expect(handler.messages).to.eql(['one', 'two']);
      expect(filter1.messages).to.eql(['one', 'one', 'two', 'two']);
      expect(filter2.messages).to.eql(['one', 'two']);
    });

  });

  describe('removeMessageFilter()', () => {

    it('should remove a previously installed filter', () => {
      let handler = new Handler();
      let filter = new Filter();
      filter.filterTypes = ['one'];
      sendMessage(handler, new Message('one'));
      installMessageFilter(handler, filter);
      sendMessage(handler, new Message('one'));
      removeMessageFilter(handler, filter);
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql(['one', 'one']);
      expect(filter.messages).to.eql(['one']);
    });

    it('should be a no-op if the filter was not installed', () => {
      let handler = new Handler();
      let filter = new Filter();
      filter.filterTypes = ['one'];
      sendMessage(handler, new Message('one'));
      removeMessageFilter(handler, filter);
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql(['one', 'one']);
    });

    it('should remove all occurrences of a filter', () => {
      let handler = new Handler();
      let filter1 = new Filter();
      let filter2 = new Filter();
      filter1.filterTypes = ['one'];
      filter2.filterTypes = ['two'];
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter1);
      sendMessage(handler, new Message('two'));
      sendMessage(handler, new Message('one'));
      expect(handler.messages).to.eql([]);
      removeMessageFilter(handler, filter1);
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('two'));
      expect(handler.messages).to.eql(['one']);
      removeMessageFilter(handler, filter2);
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('two'));
      expect(handler.messages).to.eql(['one', 'one', 'two']);
    });

    it('should be safe to remove a filter while filtering', () => {
      let handler = new Handler();
      let filter1 = new Filter();
      let filter2 = new RemovingFilter();
      let filter3 = new Filter();
      installMessageFilter(handler, filter1);
      installMessageFilter(handler, filter2);
      installMessageFilter(handler, filter3);
      sendMessage(handler, new Message('one'));
      sendMessage(handler, new Message('two'));
      sendMessage(handler, new Message('three'));
      expect(handler.messages).to.eql(['one', 'two', 'three']);
      expect(filter1.messages).to.eql(['one', 'two', 'three']);
      expect(filter2.messages).to.eql(['one']);
      expect(filter3.messages).to.eql(['one', 'two', 'three']);
    });

  });

  describe('clearMessageData()', () => {

    it('should remove all message data associated with a handler', (done) => {
      let handler = new Handler();
      let filter = new Filter();
      installMessageFilter(handler, filter);
      postMessage(handler, new Message('one'));
      postMessage(handler, new Message('two'));
      postMessage(handler, new Message('three'));
      clearMessageData(handler);
      raf(() => {
        expect(handler.messages).to.eql([]);
        expect(filter.messages).to.eql([]);
        done();
      });
    });

  });

});
