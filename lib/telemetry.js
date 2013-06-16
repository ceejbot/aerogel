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

	this.driver = driver;
	this.total = 0;
	this.tableOfContents = {};
	this.CRC = null;
	this.motorblock = null;
	this.stabilizerblock = null;
	this.nextBlockID = 16;
	this.blocks = {};
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
	console.log('telemetry variable: ' + item.fullname, item.id);
	this.tableOfContents[item.fullname] = item;

	if (item.id < this.total)
		this.driver.requestTelemetryElement(item.id + 1);
	else
		this.driver.telemetryReady();
};

Telemetry.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1];
	this.CRC = payload.slice(2);
	this.driver.requestTelemetryElement(0);
};

Telemetry.prototype.handleSettings = function(payload)
{
	switch (payload[0])
	{
	case Crazypacket.Commands.CREATE_BLOCK:
		console.log('telemetry block ' + payload[1] + ' created: ' + (payload[2] === 0));
		this.handleBlockCreated(payload[1], payload[2]);
		break;

	case Crazypacket.Commands.APPEND_BLOCK:
		console.log('telemetry block ' + payload[1] + ' appended to: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.DELETE_BLOCK:
		console.log('telemetry block ' + payload[1] + ' deleted: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.START_LOGGING:
		console.log('telemetry block ' + payload[1] + ' enabled: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.STOP_LOGGING:
		console.log('telemetry block ' + payload[1] + ' stopped: ' + (payload[2] === 0));
		break;

	case Crazypacket.Commands.RESET_LOGGING:
		console.log('telemetry reset: ' + payload.slice(1));
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
		console.log('unknown telemetry block', payload[0]);
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
			{ storage: 0, type: this.tableOfContents['motor.m1'].type, id: this.tableOfContents['motor.m1'].id },
			{ storage: 0, type: this.tableOfContents['motor.m2'].type, id: this.tableOfContents['motor.m2'].id },
			{ storage: 0, type: this.tableOfContents['motor.m3'].type, id: this.tableOfContents['motor.m3'].id },
			{ storage: 0, type: this.tableOfContents['motor.m4'].type, id: this.tableOfContents['motor.m4'].id },
		],
	};

	this.driver.createTelemetryBlock()
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
			{ storage: 0, type: this.tableOfContents['stabilizer.roll'].type, id: this.tableOfContents['stabilizer.roll'].id },
			{ storage: 0, type: this.tableOfContents['stabilizer.pitch'].type, id: this.tableOfContents['stabilizer.pitch'].id },
			{ storage: 0, type: this.tableOfContents['stabilizer.yaw'].type, id: this.tableOfContents['stabilizer.yaw'].id },
			{ storage: 0, type: this.tableOfContents['stabilizer.thrust'].type, id: this.tableOfContents['stabilizer.thrust'].id },
		],
	};

	this.driver.createTelemetryBlock(block)
	.then(function()
	{
		self.stabilizerblock = block.id;
		self.driver.enableTelemetryBlock(block.id);
	}).done();
};

Telemetry.prototype.handleBlockCreated = function(block, status)
{
	if (status !== 0)
		return; // TODO

	this.driver.enableTelemetryBlock(block);
};

Telemetry.prototype.handleMotorTelemetry = function(payload)
{
	// parse
	// notify listeners
};

Telemetry.prototype.handleStabilizerTelemetry = function(payload)
{
	// parse
	// notify listeners
	console.log('got stabilizer telemetry');
	console.log(payload);

	var update =
	{
		roll: 0,
		pitch: 0,
		yaw: 0
	};

	this.emit('stabilizer', update);
};

function TelemetryDatum()
{
	this.id = null;
	this.type = null;
	this.group = '';
	this.name = '';
	this.fullname = '';
}

function status(code)
{
	/*
	0x00	 No error
	0x01	 Block not found
	0x02	 Block already created, needs delete
	0xFF	 Generic error
	*/
}


module.exports = Telemetry;
