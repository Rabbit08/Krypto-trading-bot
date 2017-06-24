import Models = require("../../share/models");
import Utils = require("../utils");
import Interfaces = require("../interfaces");
import Config = require("../config");

export class NullOrderGateway implements Interfaces.IOrderEntryGateway {
    OrderUpdate = new Utils.Evt<Models.OrderStatusUpdate>();
    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();

    supportsCancelAllOpenOrders = () : boolean => { return false; };
    cancelAllOpenOrders = () : Promise<number> => { return Promise.resolve(0); };

    public cancelsByClientOrderId = true;

    generateClientOrderId = (): string => {
        return new Date().valueOf().toString().substr(-9);
    }

    private raiseTimeEvent = (o: Models.OrderStatusReport) => {
        this.OrderUpdate.trigger({
            orderId: o.orderId,
            computationalLatency: new Date().valueOf() - o.time.valueOf()
        })
    };

    sendOrder(order: Models.OrderStatusReport) {
        if (order.timeInForce == Models.TimeInForce.IOC)
            throw new Error("Cannot send IOCs");
        setTimeout(() => this.trigger(order.orderId, Models.OrderStatus.Working, order), 10);
        this.raiseTimeEvent(order);
    }

    cancelOrder(cancel: Models.OrderStatusReport) {
        setTimeout(() => this.trigger(cancel.orderId, Models.OrderStatus.Complete), 10);
        this.raiseTimeEvent(cancel);
    }

    replaceOrder(replace: Models.OrderStatusReport) {
        this.cancelOrder(replace);
        this.sendOrder(replace);
    }

    private trigger(orderId: string, status: Models.OrderStatus, order?: Models.OrderStatusReport) {
        var rpt: Models.OrderStatusUpdate = {
            orderId: orderId,
            orderStatus: status,
            time: new Date()
        };
        this.OrderUpdate.trigger(rpt);

        if (status === Models.OrderStatus.Working && Math.random() < .1) {
            var rpt: Models.OrderStatusUpdate = {
                orderId: orderId,
                orderStatus: status,
                time: new Date(),
                lastQuantity: order.quantity,
                lastPrice: order.price,
                liquidity: Math.random() < .5 ? Models.Liquidity.Make : Models.Liquidity.Take
            };
            setTimeout(() => this.OrderUpdate.trigger(rpt), 1000);
        }
    }

    constructor() {
        setTimeout(() => this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected), 500);
    }
}

export class NullPositionGateway implements Interfaces.IPositionGateway {
    PositionUpdate = new Utils.Evt<Models.CurrencyPosition>();
    constructor(pair: Models.CurrencyPair) {
        setInterval(() => this.PositionUpdate.trigger(new Models.CurrencyPosition(500, 50, pair.base)), 2500);
        setInterval(() => this.PositionUpdate.trigger(new Models.CurrencyPosition(500, 50, pair.quote)), 2500);
    }
}

export class NullMarketDataGateway implements Interfaces.IMarketDataGateway {
    MarketData = new Utils.Evt<Models.Market>();
    ConnectChanged = new Utils.Evt<Models.ConnectivityStatus>();
    MarketTrade = new Utils.Evt<Models.GatewayMarketTrade>();

    constructor(private _minTick: number) {
        setTimeout(() => this.ConnectChanged.trigger(Models.ConnectivityStatus.Connected), 500);
        setInterval(() => this.MarketData.trigger(this.generateMarketData()), 5000);
        setInterval(() => this.MarketTrade.trigger(this.genMarketTrade()), 15000);
    }

    private getPrice = (sign: number) => Utils.roundNearest(1000 + sign * 100 * Math.random(), this._minTick);

    private genMarketTrade = () => {
        const side = (Math.random() > .5 ? Models.Side.Bid : Models.Side.Ask);
        const sign = Models.Side.Ask === side ? 1 : -1;
        return new Models.GatewayMarketTrade(this.getPrice(sign), Math.random(), new Date(), false, side);
    }

    private genSingleLevel = (sign: number) => new Models.MarketSide(this.getPrice(sign), Math.random());

    private readonly Depth: number = 25;
    private generateMarketData = () => {
       const genSide = (sign: number) => {
          var s = [];
          for (var i = this.Depth;i--;) s.push(this.genSingleLevel(sign));
          return s.sort((a, b) => sign*a.price<sign*b.price?1:(sign*a.price>sign*b.price?-1:0));
       };
       return new Models.Market(genSide(-1), genSide(1), new Date());
    };
}

class NullGatewayDetails implements Interfaces.IExchangeDetailsGateway {
    public get hasSelfTradePrevention() {
        return false;
    }

    name(): string {
        return "Null";
    }

    makeFee(): number {
        return 0;
    }

    takeFee(): number {
        return 0;
    }

    exchange(): Models.Exchange {
        return Models.Exchange.Null;
    }

    constructor(public minTickIncrement: number, public minSize: number) {}
}

class NullGateway extends Interfaces.CombinedGateway {
    constructor(config: Config.ConfigProvider, pair: Models.CurrencyPair) {
        const minTick = .01;
        super(
            new NullMarketDataGateway(minTick),
            new NullOrderGateway(),
            new NullPositionGateway(pair),
            new NullGatewayDetails(minTick, 0.01));
    }
}

export async function createNullGateway(config: Config.ConfigProvider, pair: Models.CurrencyPair) : Promise<Interfaces.CombinedGateway> {
    return new NullGateway(config, pair);
}
