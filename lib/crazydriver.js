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
	this.datarate = 0;
	this.queue    = [];
}
util.inherits(CrazyProtocolDriver, events.EventEmitter);

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
		case '250K':
			this.datarate = Crazyradio.DATARATE['250KPS'];
			break;

		case '1MMPS':
			this.datarate = Crazyradio.DATARATE['1MPS'];
			break;

		case '2MPS':
			this.datarate = Crazyradio.DATARATE['2MPS'];
			break;
		}
	}

	this.channel = parseInt(pieces[1], 10);

	this.radio = new Crazyradio();
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
		console.log(item);
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




CrazyProtocolDriver.prototype.scanInterface = function()
{
	// TODO
};

CrazyProtocolDriver.prototype.handleAck = function(ack)
{
	// TODO record ack stats

	return ack;
};

CrazyProtocolDriver.prototype.send = function(item)
{
	var self = this;

	return self.radio.sendPacket(item)
	.then(self.handleAck)
	.done();
};

module.exports = CrazyProtocolDriver;
