import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Observable } from 'rxjs/Observable';
import { BitfenixChannel, BitfenixTradeChannel, BitfenixTickerChannel, BitfenixChannelSubscription, BitfenixBooksChannel } from 'app/api/bitfenix/bitfenix-channels';
import { BitfenixChannelMessage, TradeMessage } from 'app/api/bitfenix/bitfenix-channel-messages';
import 'rxjs/Rx';

@Injectable()
export class BitfenixService {
  private _this;
  private _apiUrl: string = 'wss://api.bitfinex.com/ws/2';
  private _socketConnection: WebSocket;

  private _activeSubscriptions: Map<number, BitfenixChannel>;
  private _queuedSubscriptions: Map<string, BitfenixChannel>;

  constructor() {
    this._activeSubscriptions = new Map<number, BitfenixChannel>( );
    this._queuedSubscriptions = new Map<string, BitfenixChannel>( );

    if (this.initBitfenix( )) {
    }
  }

  getTradeListener( fromCurrency: string, toCurrency: string ): BitfenixChannelSubscription {
    console.log( 'BitfinexService | getTradeListener | fromCurrency: ' + fromCurrency + ' toCurrency: ' + toCurrency);

    let pair = fromCurrency.toUpperCase( ) + toCurrency.toUpperCase( );

    let tradeChannels = Array.from( this._activeSubscriptions.values( ) ).filter( item => (item as BitfenixTradeChannel) !== undefined ) as BitfenixTradeChannel[];
    let channel = tradeChannels.find( item => item.pair === pair );

    if (!channel) {
      channel = new BitfenixTradeChannel( );
      channel.pair = fromCurrency + toCurrency;
      // channel.symbol = 't' + channel.pair;
      this._queuedSubscriptions.set( 'trades_' + channel.pair, channel );

      if (this._socketConnection && this._socketConnection.readyState === 1 ) {
        this._socketConnection.send( channel.getSubscribeMessage( ) );
      }
    }

    return channel.getSubscription( );
  }

  getTickerListener( fromCurrency: string, toCurrency: string ): BitfenixChannelSubscription {
    console.log( 'BitfinexService | getTickerListener | fromCurrency: ' + fromCurrency + ' toCurrency: ' + toCurrency);

    let pair = fromCurrency.toUpperCase( ) + toCurrency.toUpperCase( );

    let tradeChannels = Array.from( this._activeSubscriptions.values( ) ).filter( item => (item as BitfenixTickerChannel) !== undefined ) as BitfenixTickerChannel[];
    let channel = tradeChannels.find( item => item.pair === pair );

    if (!channel) {
      channel = new BitfenixTickerChannel( );
      channel.pair = pair;
      channel.symbol = 't' + pair;
      this._queuedSubscriptions.set( 'ticker_' + channel.symbol, channel );

      if (this._socketConnection && this._socketConnection.readyState === 1 ) {
        this._socketConnection.send( channel.getSubscribeMessage( ) );
      }
    }

    return channel.getSubscription( );
  }

  getBooksListener( symbol: string, options: { prec: string, freq: string, length: string} ): BitfenixChannelSubscription {
    let booksChannels = Array.from( this._activeSubscriptions.values( ) ).filter( item => (item as BitfenixBooksChannel) !== undefined ) as BitfenixBooksChannel[];
    let channel = booksChannels.find( item => item.symbol === symbol );

    if (!channel) {
      channel = new BitfenixBooksChannel( );
      channel.symbol = symbol;

      this._queuedSubscriptions.set( channel.symbol, channel );

      if (this._socketConnection && this._socketConnection.readyState === 1 ) {
        this._socketConnection.send( channel.getSubscribeMessage( options ) );
      }
    }

    return channel.getSubscription( );
  }

  /**
   * symbol:
   * precision: Level of price aggregation (P0, P1, P2, P3). The default is P0
   * frequency: Frequency of updates (F0, F1). F0=realtime / F1=2sec. The default is F0.
   * length: Number of price points ("25", "100") [default="25"]
   */
  private subscribeBooks( symbol: string, options: { precision?: string, frequency?: string, length?: string } ): boolean {
    let message = {
      'event': 'subscribe',
      'channel': 'book',
      'symbol': symbol,
      'prec': 'P0',
      'freq': 'F0',
      'length': '25'
    };

    if (options) {
      if (options.precision) {
        message.prec = options.precision;
      }
      if (options.frequency) {
        message.freq = options.frequency;
      }
      if (options.length) {
        message.length = options.length;
      }
    }

    if (this._socketConnection) {
      this._socketConnection.send( message );
      return true;
    }

    return false;
  }

  /***/

  private initBitfenix( ): boolean {
    this._socketConnection = new WebSocket( this._apiUrl );
    this._socketConnection.onopen = this.onOpen.bind(this); // bind(this) preserves the this-context for the called method
    this._socketConnection.onerror = this.onError.bind(this);
    this._socketConnection.onclose = this.onClose.bind(this);
    this._socketConnection.onmessage = this.onMessage.bind(this);

    return true;
  }

  private onMessage(message: MessageEvent): any {
    let parsedMessage = JSON.parse(message.data);

    if (parsedMessage) {
      if (parsedMessage.hasOwnProperty('event')) {
        switch (parsedMessage.event) {
          case 'info': {
            console.log( '### INFO: ' + JSON.stringify(parsedMessage) );
            break;
          }
          case 'conf': {
            console.log( '### CONF: ' + JSON.stringify(parsedMessage) );
            break;
          }
          case 'pong': {
            console.log( '### PONG: ' + JSON.stringify(parsedMessage) );
            break;
          }
          case 'subscribed': {
            this.subscriptionReceived(parsedMessage);
            break;
          }
          case 'unsubscribed': {
            console.log( '### UNSUBSCRIBED: ' + JSON.stringify(parsedMessage) );
            break;
          }
          case 'error': {
            console.log( '### ERROR: ' + JSON.stringify(parsedMessage) );
            break;
          }
          default: {
            // update message
            break;
          }
        }
      } else {
        let channelId: number = parsedMessage[0];

        if (this._activeSubscriptions.has(channelId) ) {
          if (parsedMessage[1] === 'hb') {
            this._activeSubscriptions.get(channelId).sendHeartbeat();
          } else {
            this._activeSubscriptions.get(channelId).sendMessage( parsedMessage );
          }
        }

        let tradeMessage = BitfenixChannelMessage.create(parsedMessage);
        console.log( 'QuoteService | onMessage: ' + JSON.stringify(tradeMessage));
      }
    }
  }

  private onOpen(event: Event) {
    console.log( 'QuoteService | onOpen: ' + JSON.stringify(event));

    if (this._queuedSubscriptions.size > 0) {
      console.log( 'Items in queue: ' + this._queuedSubscriptions.size);

      this._queuedSubscriptions.forEach( item => {
        this._socketConnection.send( item.getSubscribeMessage( ) );
      })
    }
  }

  private onClose(event: CloseEvent): any {
    console.log( 'QuoteService | onClose: ' + JSON.stringify(event));
  }

  private onError(event: Event): any {
    console.log( 'QuoteService | onError: ' + JSON.stringify(event));
  }

  /***/

  private subscriptionReceived( parsedMessage: ITradeSubscription ): void {
    console.log( '### SUBSCRIBED: ' + JSON.stringify(parsedMessage) );

    let pair = parsedMessage.pair;
    let symbol = parsedMessage.symbol;
    let channel = parsedMessage.channel;
    let cacheKey: string;

    if (this._queuedSubscriptions.has(channel + '_' + pair)) {
      cacheKey = channel + '_' + pair;
    }
    if (this._queuedSubscriptions.has(channel + '_' + symbol)) {
      cacheKey = channel + '_' + symbol;
    }

    if (cacheKey && cacheKey.length > 0) {
      let bitfenixChannel = this._queuedSubscriptions.get(cacheKey);
      bitfenixChannel.channel = parsedMessage.channel;
      bitfenixChannel.channelId = parsedMessage.chanId;

      this._activeSubscriptions.set(bitfenixChannel.channelId, bitfenixChannel);
      this._queuedSubscriptions.delete(cacheKey);
    } else {
      console.log('No queued subscription found for currency-pair: ' + pair);
    }
  }

  // private unsubscribeReceived( parsedMessage: ITradeUnsubscribe ): void {
  // }
}

export interface ITradeSubscription {
  event: string;
  channel: string;
  chanId: number;
  symbol: string;
  pair: string;
}