// See the logging section here:
// http://wiki.bitcraze.se/projects:crazyflie:pc_utils:pylib

var
	_           = require('lodash'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	Protocol    = require('./protocol')
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
	this.accblock        = null;
	this.nextBlockID     = 16;
	this.blocks          = {};
}
util.inherits(Telemetry, events.EventEmitter);

Telemetry.prototype.handlePacket = function(packet)
{
	switch (packet.channel)
	{
	case Protocol.Channels.TOC:
		if (packet.payload[0] === Protocol.Commands.GET_ELEMENT)
			this.handleTOCElement(packet.payload);
		else
			this.handleTOCInfo(packet.payload);
		break;

	case Protocol.Channels.SETTINGS:
		this.handleSettings(packet.payload);
		break;

	case Protocol.Channels.LOGDATA:
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

	var item = new TelemetryDatum();
	item.read(payload);

	// console.log('telemetry: ' + item.fullname, item.id, item.type);
	this.variables[item.fullname] = item;

	if (item.id < this.total)
		this.driver.requestTelemetryElement(item.id + 1);
	else
		this.driver.telemetryReady();
};

Telemetry.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1] - 1;
	this.CRC = payload.readUInt16LE(2);
	this.driver.requestTelemetryElement(0);
};

Telemetry.prototype.handleSettings = function(payload)
{
	switch (payload[0])
	{
	case Protocol.Commands.CREATE_BLOCK:
		//console.log('telemetry block ' + payload[1] + ' created: ' + (payload[2] === 0));
		break;

	case Protocol.Commands.APPEND_BLOCK:
		console.log('telemetry block ' + payload[1] + ' appended to: ' + (payload[2] === 0));
		break;

	case Protocol.Commands.DELETE_BLOCK:
		console.log('telemetry block ' + payload[1] + ' deleted: ' + (payload[2] === 0));
		break;

	case Protocol.Commands.START_LOGGING:
		// console.log('telemetry block ' + payload[1] + ' enabled: ' + (payload[2] === 0));
		break;

	case Protocol.Commands.STOP_LOGGING:
		console.log('telemetry block ' + payload[1] + ' stopped: ' + (payload[2] === 0));
		break;

	case Protocol.Commands.RESET_LOGGING:
		// console.log('telemetry reset: ' + payload.slice(1));
		break;
	}
};

Telemetry.prototype.handleBlock = function(payload)
{
	switch (payload[0])
	{
	case this.motorblock:
		this.handleMotor(payload);
		break;

	case this.stabilizerblock:
		this.handleStabilizer(payload);
		break;

	case this.accblock:
		this.handleAccelerometer(payload);
		break;

	default:
		// console.log('got telemetry but not ready for it yet; id=', payload[0]);
		break;
	}
};


Telemetry.prototype.subscribe = function(group, subfunc)
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

	case 'accelerometer':
		if (!this.variables['acc.x'])
		{
			console.log('** no accelerometer telemetry available');
			return;
		}
		this.startAccelerometer();
		this.addListener('accelerometer', subfunc);
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
			{ fetchAs: 5, type: this.variables['stabilizer.thrust'].type, id: this.variables['stabilizer.thrust'].id },
		],
	};

	this.driver.createTelemetryBlock(block)
	.then(function()
	{
		self.stabilizerblock = block.id;
		self.driver.enableTelemetryBlock(block.id);
	}).done();
};

Telemetry.prototype.startAccelerometer = function()
{
	var self = this;
	if (this.accblock)
		return;

	var block =
	{
		id: this.nextBlockID++,
		variables:
		[
			{ fetchAs: 7, type: this.variables['acc.x'].type, id: this.variables['acc.x'].id },
			{ fetchAs: 7, type: this.variables['acc.y'].type, id: this.variables['acc.y'].id },
			{ fetchAs: 7, type: this.variables['acc.z'].type, id: this.variables['acc.z'].id },
		],
	};

	this.driver.createTelemetryBlock(block)
	.then(function()
	{
		self.accblock = block.id;
		self.driver.enableTelemetryBlock(block.id);
	}).done();
};

Telemetry.prototype.handleMotor = function(payload)
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

Telemetry.prototype.handleStabilizer = function(payload)
{
	var update =
	{
		roll:   payload.readFloatLE(4),
		pitch:  payload.readFloatLE(8),
		yaw:    payload.readFloatLE(12),
		thrust: payload.readInt16LE(16)
	};
	this.emit('stabilizer', update);
};

Telemetry.prototype.handleAccelerometer = function(payload)
{
	var update =
	{
		x: payload.readFloatLE(4),
		y: payload.readFloatLE(8),
		z: payload.readFloatLE(12)
	};
	this.emit('accelerometer', update);
};

function TelemetryDatum()
{
	this.id       = null;
	this.type     = null;
	this.group    = '';
	this.name     = '';
	this.fullname = '';
}

TelemetryDatum.prototype.read = function(payload)
{
	var ptr = 1;
	this.id = payload[ptr++];
	this.type = payload[ptr++];

	var start = ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	this.group = payload.slice(start, ptr).toString();

	start = ++ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	this.name = payload.slice(start, ptr).toString();

	this.fullname = this.group + '.' + this.name;
};

module.exports = Telemetry;
