/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import {
  Queue
} from 'phosphor-queue';


/**
 * A mesage which can be sent or posted to a message handler.
 *
 * #### Notes
 * This class may be subclassed to create complex message types.
 *
 * **See Also** [[postMessage]] and [[sendMessage]].
 */
export
class Message {
  /**
   * Construct a new message.
   *
   * @param type - The type of the message. Consumers of a message will
   *   use this value to cast the message to the appropriately derived
   *   message type.
   */
  constructor(type: string) {
    this._type = type;
  }

  /**
   * Get the type of the message.
   */
  get type(): string {
    return this._type;
  }

  private _type: string;
}


/**
 * An object which handles messages.
 *
 * #### Notes
 * User objects should implement this interface in order to be used
 * as the target handler of sent or posted messages.
 *
 * **See Also** [[postMessage]] and [[sendMessage]].
 */
export
interface IMessageHandler {
  /**
   * Process a message dispatched to the handler.
   *
   * @param msg - The message which was dispatched to the handler.
   */
  processMessage(msg: Message): void;

  /**
   * Compress a message posted to the handler.
   *
   * @param msg - The message which was posted to the handler.
   *
   * @param queue - The queue of pending messages for the handler.
   *
   * @returns `true` if the message was compressed and should be
   *   dropped, or `false` if the message should be enqueued for
   *   delivery as normal.
   *
   * #### Notes
   * This method allows the handler to merge a posted message with a
   * message which is already pending. This is usefull for 'collapsing'
   * messages where the resulting action should only occur once per
   * event look cycle.
   */
  compressMessage?(msg: Message, pending: Queue<Message>): boolean;
}


/**
 * An object which filters messages dispatched to a message handler.
 *
 * #### Notes
 * User objects should implement this interface in order to be used
 * as a message filter for a message handler.
 *
 * **See Also** [[installMessageFilter]].
 */
export
interface IMessageFilter {
  /**
   * Filter a message sent to a message handler.
   *
   * @param handler - The target handler of the message.
   *
   * @param msg - The message dispatched to the handler.
   *
   * @returns `true` if the message should be filtered, of `false`
   *   if the message should be dispatched to the handler as normal.
   */
  filterMessage(handler: IMessageHandler, msg: Message): boolean;
}


/**
 * Send a message to the message handler to process immediately.
 *
 * @param handler - The handler which should process the message.
 *
 * @param msg - The message to send to the handler.
 *
 * #### Notes
 * Unlike [[postMessage]], [[sendMessage]] delivers the message to
 * the handler immediately. The handler will not have the opportunity
 * to compress the message, however the message will still be sent
 * through any installed message filters.
 *
 * **See Also** [[postMessage]].
 */
export
function sendMessage(handler: IMessageHandler, msg: Message): void {
  getDispatcher(handler).sendMessage(handler, msg);
}


/**
 * Post a message to the message handler to process in the future.
 *
 * @param handler - The handler which should process the message.
 *
 * @param msg - The message to post to the handler.
 *
 * #### Notes
 * Unlike [[sendMessage]], [[postMessage]] will schedule the deliver of
 * the message for the next cycle of the event loop. The handler will
 * have the opportunity to compress the message in order to optimize
 * its handling of similar messages. The message will be sent through
 * any installed message filters before being delivered to the handler.
 *
 * **See Also** [[sendMessage]].
 */
export
function postMessage(handler: IMessageHandler, msg: Message): void {
  getDispatcher(handler).postMessage(handler, msg);
}


/**
 * Test whether a message handler has posted messages pending delivery.
 *
 * @param handler - The message handler of interest.
 *
 * @returns `true` if the handler has pending posted messages, `false`
 *   otherwise.
 *
 * **See Also** [[sendPendingMessage]].
 */
export
function hasPendingMessages(handler: IMessageHandler): boolean {
  return getDispatcher(handler).hasPendingMessages();
}


/**
 * Send the first pending posted message to the message handler.
 *
 * @param handler - The message handler of interest.
 *
 * #### Notes
 * If the handler has no pending messages, this is a no-op.
 *
 * **See Also** [[hasPendingMessages]].
 */
export
function sendPendingMessage(handler: IMessageHandler): void {
  getDispatcher(handler).sendPendingMessage(handler);
}


/**
 * Install a message filter for a message handler.
 *
 * A message filter is invoked before the message handler processes a
 * message. If the filter returns `true` from its [[filterMessage]] method,
 * no other filters will be invoked, and the message will not be delivered.
 *
 * The most recently installed message filter is executed first.
 *
 * @param handler - The handler whose messages should be filtered.
 *
 * @param filter - The filter to install for the handler.
 *
 * #### Notes
 * It is possible to install the same filter multiple times. If the
 * filter should be unique, call [[removeMessageFilter]] first.
 *
 * **See Also** [[removeMessageFilter]].
 */
export
function installMessageFilter(handler: IMessageHandler, filter: IMessageFilter): void {
  getDispatcher(handler).installMessageFilter(filter);
}


/**
 * Remove a previously installed message filter for a message handler.
 *
 * @param handler - The handler for which the filter is installed.
 *
 * @param filter - The filter to remove.
 *
 * #### Notes
 * This will remove **all** occurrences of the filter. If the filter is
 * not installed, this is a no-op.
 *
 * It is safe to call this function while the filter is executing.
 *
 * **See Also** [[installMessageFilter]].
 */
export
function removeMessageFilter(handler: IMessageHandler, filter: IMessageFilter): void {
  getDispatcher(handler).removeMessageFilter(filter);
}


/**
 * Clear all message data associated with the message handler.
 *
 * @param handler - The message handler for which to clear the data.
 *
 * #### Notes
 * This will remove all pending messages and filters for the handler.
 */
export
function clearMessageData(handler: IMessageHandler): void {
  var dispatcher = dispatcherMap.get(handler);
  if (dispatcher) dispatcher.clear();
  dispatchQueue.removeAll(handler);
}


/**
 * The internal mapping of message handler to message dispatcher
 */
var dispatcherMap = new WeakMap<IMessageHandler, MessageDispatcher>();


/**
 * The internal queue of pending message handlers.
 */
var dispatchQueue = new Queue<IMessageHandler>();


/**
 * The internal animation frame id for the message loop wake up call.
 */
var frameId: any = void 0;


/**
 * A local reference to an event loop hook.
 */
var raf: (cb: () => void) => any;
if (typeof requestAnimationFrame === 'function') {
  raf = requestAnimationFrame;
} else {
  raf = setImmediate;
}


/**
 * Get or create the message dispatcher for a message handler.
 */
function getDispatcher(handler: IMessageHandler): MessageDispatcher {
  var dispatcher = dispatcherMap.get(handler);
  if (dispatcher) return dispatcher;
  dispatcher = new MessageDispatcher();
  dispatcherMap.set(handler, dispatcher);
  return dispatcher;
}


/**
 * Wake up the message loop to process any pending dispatchers.
 *
 * This is a no-op if a wake up is not needed or is already pending.
 */
function wakeUpMessageLoop(): void {
  if (frameId === void 0 && !dispatchQueue.empty) {
    frameId = raf(runMessageLoop);
  }
}


/**
 * Run an iteration of the message loop.
 *
 * This will process all pending dispatchers in the queue. Dispatchers
 * which are added to the queue while the message loop is running will
 * be processed on the next message loop cycle.
 */
function runMessageLoop(): void {
  // Clear the frame id so the next wake up call can be scheduled.
  frameId = void 0;

  // If the queue is empty, there is nothing else to do.
  if (dispatchQueue.empty) {
    return;
  }

  // Add a null sentinel value to the end of the queue. The queue
  // will only be processed up to the first null value. This means
  // that messages posted during this cycle will execute on the next
  // cycle of the loop. If the last value in the array is null, it
  // means that an exception was thrown by a message handler and the
  // loop had to be restarted.
  if (dispatchQueue.back !== null) {
    dispatchQueue.push(null);
  }

  // The message dispatch loop. If the dispatcher is the null sentinel,
  // the processing of the current block of messages is complete and
  // another loop is scheduled. Otherwise, the pending message is
  // dispatched to the message handler.
  while (!dispatchQueue.empty) {
    var handler = dispatchQueue.pop();
    if (handler === null) {
      wakeUpMessageLoop();
      return;
    }
    dispatchMessage(dispatcherMap.get(handler), handler);
  }
}


/**
 * Safely process the pending handler message.
 *
 * If the message handler throws an exception, the message loop will
 * be restarted and the exception will be rethrown.
 */
function dispatchMessage(dispatcher: MessageDispatcher, handler: IMessageHandler): void {
  try {
    dispatcher.sendPendingMessage(handler);
  } catch (ex) {
    wakeUpMessageLoop();
    throw ex;
  }
}


/**
 * A link in a singly-linked message filter list.
 */
interface IFilterLink {
  /**
   * The next link in the list.
   */
  next: IFilterLink;

  /**
   * The message filter for the link.
   */
  filter: IMessageFilter;
}


/**
 * An internal class which manages message dispatching for a handler.
 */
class MessageDispatcher {
  /**
   * Send a message to the handler immediately.
   *
   * The message will first be sent through installed filters.
   */
  sendMessage(handler: IMessageHandler, msg: Message): void {
    if (!this._filterMessage(handler, msg)) {
      handler.processMessage(msg);
    }
  }

  /**
   * Post a message for delivery in the future.
   *
   * The message will first be compressed if possible.
   */
  postMessage(handler: IMessageHandler, msg: Message): void {
    if (!this._compressMessage(handler, msg)) {
      this._enqueueMessage(handler, msg);
    }
  }

  /**
   * Test whether the dispatcher has messages pending delivery.
   */
  hasPendingMessages(): boolean {
    return !!(this._messages && !this._messages.empty);
  }

  /**
   * Send the first pending message to the message handler.
   */
  sendPendingMessage(handler: IMessageHandler): void {
    if (this._messages && !this._messages.empty) {
      this.sendMessage(handler, this._messages.pop());
    }
  }

  /**
   * Install a message filter for the dispatcher.
   */
  installMessageFilter(filter: IMessageFilter): void {
    this._filters = { next: this._filters, filter: filter };
  }

  /**
   * Remove all occurrences of a message filter from the dispatcher.
   */
  removeMessageFilter(filter: IMessageFilter): void {
    var link = this._filters;
    var prev: IFilterLink = null;
    while (link !== null) {
      if (link.filter === filter) {
        link.filter = null;
      } else if (prev === null) {
        this._filters = link;
        prev = link;
      } else {
        prev.next = link;
        prev = link;
      }
      link = link.next;
    }
    if (!prev) {
      this._filters = null;
    } else {
      prev.next = null;
    }
  }

  /**
   * Clear all messages and filters from the dispatcher.
   */
  clear(): void {
    if (this._messages) {
      this._messages.clear();
    }
    for (var link = this._filters; link !== null; link = link.next) {
      link.filter = null;
    }
    this._filters = null;
  }

  /**
   * Run the installed message filters for the handler.
   *
   * Returns `true` if the message was filtered, `false` otherwise.
   */
  private _filterMessage(handler: IMessageHandler, msg: Message): boolean {
    for (var link = this._filters; link !== null; link = link.next) {
      if (link.filter && link.filter.filterMessage(handler, msg)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Compress the mssage for the given handler.
   *
   * Returns `true` if the message was compressed, `false` otherwise.
   */
  private _compressMessage(handler: IMessageHandler, msg: Message): boolean {
    if (!handler.compressMessage) {
      return false;
    }
    if (!this._messages || this._messages.empty) {
      return false;
    }
    return handler.compressMessage(msg, this._messages);
  }

  /**
   * Enqueue the message for future delivery to the handler.
   */
  private _enqueueMessage(handler: IMessageHandler, msg: Message): void {
    (this._messages || (this._messages = new Queue<Message>())).push(msg);
    dispatchQueue.push(handler);
    wakeUpMessageLoop();
  }

  private _filters: IFilterLink = null;
  private _messages: Queue<Message> = null;
}
