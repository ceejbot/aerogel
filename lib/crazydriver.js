// Crazy Real Time Protocol Driver
// This module knows how to format messages for the crazy radio and the copter.

var
	_           = require('lodash'),
	events      = require('events'),
	url         = require('url'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazyradio  = require('./crazyradio'),
	Crazypacket = require('./crazypacket')
	;

function CrazyProtocolDriver(name)
{
	events.EventEmitter.call(this);

	this.uri      = '';
	this.channel  = 2;
	this.datarate = 2;
	this.queue    = [];
}
util.inherits(CrazyProtocolDriver, events.EventEmitter);

CrazyProtocolDriver.prototype.findCopters = function()
{
	var self = this;
	self.radio = new Crazyradio();

	var results;

	return self.radio.setupRadio()
	.then(self.radio.setAckRetryCount(1))
	.then(function() { return self.scanAtRate(0); })
	.then(function(res1)
	{
		results = res1;
	})
	.then(function() { return self.scanAtRate(1); })
	.then(function(res2)
	{
		results = results.concat(res2);
	})
	.then(function() { return self.scanAtRate(2); })
	.then(function(res3)
	{
		results = results.concat(res3);
		return results;
	})
	.then(function(finalr)
	{
		return finalr;
	})
	.fail(function(err)
	{
		console.log('failure while finding copters');
		console.log(err);
	});
};

CrazyProtocolDriver.DATARATE =
{
	0: '250KPS',
	1: '1MPS',
	2: '2MPS'
};


CrazyProtocolDriver.prototype.scanAtRate = function(datarate)
{
	var self = this;

	return self.radio.setDataRate(datarate)
	.then(function()
	{
		var buf = new Buffer(1);
		buf[0] = 0xFF;
		return self.radio.scanChannels(0, 127, buf);
	})
	.then(function(result)
	{
		var copters = [];
		for (var i = 0; i < result.length; i++)
		{
			copters.push(util.format('radio://1/%d/%s', result[i], CrazyProtocolDriver.DATARATE[datarate]));
		}

		return copters;
	});
};


CrazyProtocolDriver.prototype.connect = function(uri)
{
	var self = this;

	this.uri = uri;
	var parsed = url.parse(uri);
	var pieces = parsed.pathname.split('/');
	// prefered usb device is at parsed.hostname

	if (pieces.length === 3)
	{
		switch (pieces[2])
		{
		case '250KPS':
			this.datarate = Crazyradio.DATARATE['250KPS'];
			break;

		case '1MPS':
			this.datarate = Crazyradio.DATARATE['1MPS'];
			break;

		case '2MPS':
			this.datarate = Crazyradio.DATARATE['2MPS'];
			break;
		}
	}

	this.channel = parseInt(pieces[1], 10);
	return self.radio.setupRadio(null, self.channel, self.datarate);
};

CrazyProtocolDriver.prototype.status = function()
{
	if (!this.radio)
		return 'not connected to radio';

	return 'Crazyradio version ' + this.radio.version;
};

CrazyProtocolDriver.prototype.close = function()
{
	if (!this.radio)
		return P('OK');

	return this.radio.close();
};

CrazyProtocolDriver.prototype.setpoint = function(roll, pitch, yaw, thrust)
{
	var self = this,
		deferred = P.defer();

	var packet = new Crazypacket();
	packet.port = Crazypacket.Ports.COMMANDER;

	// first byte is for the header data
	packet.writeFloat(roll)
		.writeFloat(-pitch)
		.writeFloat(yaw)
		.writeUnsignedShort(thrust)
		.endPacket();

	return this.radio.sendPacket(packet.data)
	.then(function(item)
	{
		// console.log(item);
		return item;
	})
	.fail(function(err)
	{
		console.log('failure in setpoint');
		console.log(err);
	});
};

// parameter functions: get list, set, get
// telemetry aka logging functions


// this needs another home
var CRTPCommands =
{
	TOC_ELEMENT: 0,
	TOC_INFO: 1,
};

CrazyProtocolDriver.prototype.startTelemetry = function()
{
	return this.requestTOC();
};

CrazyProtocolDriver.prototype.requestTOC = function()
{
	console.log('requesting telemetry toc');
	var self = this;

	var packet = new Crazypacket();
	packet.header = Crazypacket.LoggingHeaders.TOC;
	packet.writeByte(0).endPacket();

	return self.radio.sendPacket(packet.data)
	.then(function()
	{
		var p2 = new Crazypacket();
		p2.port = Crazypacket.Ports.LOGGING;
		p2.channel = Crazypacket.Channels.TOC;
		p2.writeByte(Crazypacket.Commands.GET_INFO).endPacket();

		return self.radio.sendPacket(p2.data);
	});
};

CrazyProtocolDriver.prototype.handleAck = function(buf)
{
	// TODO record ack stats
	var ack = new Crazypacket.RadioAck(buf);
	return P(ack);
};

CrazyProtocolDriver.prototype.send = function(item)
{
	var self = this;

	return self.radio.sendPacket(item)
	.then(self.handleAck)
	.done();
};

module.exports = CrazyProtocolDriver;
