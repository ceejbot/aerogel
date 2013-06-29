// See the logging section here:
// http://wiki.bitcraze.se/projects:crazyflie:pc_utils:pylib

var
	_           = require('lodash'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazypacket = require('./crazypacket')
	;

var DataTypes =
{
	1: 'uint8_t',
	2: 'uint16_t',
	3: 'uint32_t',
	4: 'int8_t',
	5: 'int16_t',
	6: 'int32_t',
	7: 'float32',
	8: 'float16'
};

function Telemetry(driver)
{
	events.EventEmitter.call(this);

	this.driver          = driver;
	this.total           = 0;
	this.variables       = {};
	this.CRC             = null;
	this.motorblock      = null;
	this.stabilizerblock = null;
	this.nextBlockID     = 16;
	this.blocks          = {};
}
util.inherits(Telemetry, events.EventEmitter);

Telemetry.prototype.handlePacket = function(packet)
{
	switch (packet.channel)
	{
	case Crazypacket.Channels.TOC:
		if (packet.payload[0] === Crazypacket.Commands.GET_ELEMENT)
			this.handleTOCElement(packet.payload);
		else
			this.handleTOCInfo(packet.payload);
		break;

	case Crazypacket.Channels.SETTINGS:
		this.handleSettings(packet.payload);
		break;

	case Crazypacket.Channels.LOGDATA:
		this.handleBlock(packet.payload);
		break;

	default:
		console.log('unhandled packet', packet.header, packet.payload);
		break;
	}
};

Telemetry.prototype.handleTOCElement = function(payload)
{
	if (payload.length < 2)
		return this.driver.telemetryReady();

	var ptr = 1;
	// var next = payload[1];
	var item = new TelemetryDatum();
	item.id = payload[ptr++];
	item.type = payload[ptr++];

	var start = ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	item.group = payload.slice(start, ptr).toString();

	start = ++ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	item.name = payload.slice(start, ptr).toString();

	item.fullname = item.group + '.' + item.name;
	// console.log('telemetry variable: ' + item.fullname, item.id, item.type);
	this.variables[item.fullname] = item;

	if (item.id < this.total)
		this.driver.requestTelemetryElement(item.id + 1);
	else
		this.driver.telemetryReady();
};

Telemetry.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1];
	this.CRC   = payload.slice(2);
	this.driver.requestTelemetryElement(0);
};

Telemetry.prototype.handleSettings = function(payload)
{
	switch (payload[0])
	{
	case Crazypacket.Commands.CREATE_BLOCK:
		//console.log('telemetry block ' + payload[1] + ' created: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.APPEND_BLOCK:
		console.log('telemetry block ' + payload[1] + ' appended to: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.DELETE_BLOCK:
		console.log('telemetry block ' + payload[1] + ' deleted: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.START_LOGGING:
		// console.log('telemetry block ' + payload[1] + ' enabled: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.STOP_LOGGING:
		console.log('telemetry block ' + payload[1] + ' stopped: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.RESET_LOGGING:
		// console.log('telemetry reset: ' + payload.slice(1));
		break;
	}
};

Telemetry.prototype.handleBlock = function(payload)
{
	switch (payload[0])
	{
	case this.motorblock:
		this.handleMotorTelemetry(payload);
		break;

	case this.stabilizerblock:
		this.handleStabilizerTelemetry(payload);
		break;

	default:
		console.log('got telemetry but not ready for it yet; id=', payload[0]);
	}
};


Telemetry.prototype.addSubscriber = function(subfunc, group)
{
	switch (group)
	{
	case 'motor':
		this.startMotor();
		this.addListener('motor', subfunc);
		break;

	case 'stabilizer':
		this.startStabilizer();
		this.addListener('stabilizer', subfunc);
		break;

	default:
		console.error('warning: cannot subscribe to non-existent telemetry group ' + group);
	}
};

Telemetry.prototype.startMotor = function()
{
	var self = this;
	if (this.motorblock)
		return;

	var block =
	{
		id: this.nextBlockID++,
		variables:
		[
			{ fetchAs: 5, type: this.variables['motor.m1'].type, id: this.variables['motor.m1'].id },
			{ fetchAs: 5, type: this.variables['motor.m2'].type, id: this.variables['motor.m2'].id },
			{ fetchAs: 5, type: this.variables['motor.m3'].type, id: this.variables['motor.m3'].id },
			{ fetchAs: 5, type: this.variables['motor.m4'].type, id: this.variables['motor.m4'].id },
		],
	};

	this.driver.createTelemetryBlock(block)
	.then(function()
	{
		self.motorblock = block.id;
		self.driver.enableTelemetryBlock(block.id);
	});
};

Telemetry.prototype.startStabilizer = function()
{
	var self = this;
	if (this.stabilizerblock)
		return;

	var block =
	{
		id: this.nextBlockID++,
		variables:
		[
			{ fetchAs: 7, type: this.variables['stabilizer.roll'].type, id: this.variables['stabilizer.roll'].id },
			{ fetchAs: 7, type: this.variables['stabilizer.pitch'].type, id: this.variables['stabilizer.pitch'].id },
			{ fetchAs: 7, type: this.variables['stabilizer.yaw'].type, id: this.variables['stabilizer.yaw'].id },
			// { storage: 7, type: this.variables['stabilizer.thrust'].type, id: this.variables['stabilizer.thrust'].id },
		],
	};

	this.driver.createTelemetryBlock(block)
	.then(function()
	{
		self.stabilizerblock = block.id;
		self.driver.enableTelemetryBlock(block.id);
	}).done();
};

Telemetry.prototype.handleMotorTelemetry = function(payload)
{
	var update =
	{
		m1: payload.readInt16LE(3),
		m2: payload.readInt16LE(5),
		m3: payload.readInt16LE(7),
		m4: payload.readInt16LE(9),
	};
	this.emit('motor', update);
};

Telemetry.prototype.handleStabilizerTelemetry = function(payload)
{
	var update =
	{
		roll: payload.readFloatLE(4),
		pitch: payload.readFloatLE(8),
		yaw: payload.readFloatLE(12)
	};
	this.emit('stabilizer', update);
};

function TelemetryDatum()
{
	this.id       = null;
	this.type     = null;
	this.group    = '';
	this.name     = '';
	this.fullname = '';
}

module.exports = Telemetry;
