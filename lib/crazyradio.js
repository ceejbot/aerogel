var
	_                 = require('lodash'),
	assert            = require('assert'),
	events            = require('events'),
	usb               = require('usb'),
	util              = require('util'),
	P                 = require('p-promise'),
	Crazypacket       = require('./crazypacket'),
	usbstreams        = require('./usbstreams'),
	WritableUSBStream = usbstreams.WritableUSBStream,
	ReadableUSBStream = usbstreams.ReadableUSBStream
	;

// a libusb constant
var TYPE_VENDOR = (0x02 << 5);
var LIBUSB_REQUEST_GET_STATUS = 0x0;

// radio commands
var SET_RADIO_CHANNEL = 0x01;
var SET_RADIO_ADDRESS = 0x02;
var SET_DATA_RATE     = 0x03;
var SET_RADIO_POWER   = 0x04;
var SET_RADIO_ARD     = 0x05;
var SET_RADIO_ARC     = 0x06;
var ACK_ENABLE        = 0x10;
var SET_CONT_CARRIER  = 0x20;
var SCAN_CHANNELS     = 0x21;
var LAUNCH_BOOTLOADER = 0xFF;

var P_M18DBM = 0;
var P_M12DBM = 1;
var P_M6DBM  = 2;
var P_0DBM   = 3;


// ----- The radio driver

function findCrazyradios()
{
	// Return a list of radios attached to the host
	var devices = usb.getDeviceList();
	return _.filter(devices, function(d)
	{
		return ((d.deviceDescriptor.idVendor == 0x1915) && (d.deviceDescriptor.idProduct == 0x7777));
	});
}

function Crazyradio()
{
	events.EventEmitter.call(this);

	this.device    = undefined;
	this.interface = undefined;
	this.version   = 0;
	this.arc       = -1;
	this.address   = undefined;
	this.outstream = null;
	this.instream  = null;

	this.channel = 2;
	this.datarate = 2;
	this.queue = [];
}
util.inherits(Crazyradio, events.EventEmitter);


Crazyradio.DATARATE =
{
	'250KPS': 0,
	'1MPS':   1,
	'2MPS':   2
};

Crazyradio.prototype.inputStream = function()
{
	if (!this.instream)
		this.instream = new ReadableUSBStream(this.inEndpoint);

	return this.instream;
};

Crazyradio.prototype.outputStream = function()
{
	if (!this.outstream)
		this.outstream = new WritableUSBStream(this.outEndpoint);

	return this.outstream;
};

Crazyradio.prototype.setupRadio = function(device, channel, datarate)
{
	var self = this,
		deferred = P.defer();

	if (device)
		this.device = device;
	else
	{
		var possible = findCrazyradios();
		if (possible.length > 0)
			this.device = possible[0];
		else
			throw(new Error('no Crazyradio dongle attached'));
	}

	this.channel = (_.isUndefined(channel) ? 2 : channel);
	this.datarate = (_.isUndefined(datarate) ? 2 : datarate);

	// console.log('setting up radio at ', channel, datarate);

	this.device.open();
	this.interface = this.device.interfaces[0];
	this.interface.claim();
	this.inEndpoint = this.interface.endpoints[0];
	this.outEndpoint = this.interface.endpoints[1];

	this.version = parseFloat(util.format('%d.%d', this.device.deviceDescriptor.bcdDevice >> 8, this.device.deviceDescriptor.bcdDevice & 0x0ff));
	if (this.version < 0.4)
		throw(new Error('this driver requires at least version 0.4 of the radio firmware; ' + this.version));

	var input = this.inputStream();
	input.addListener('readable', this.onReadable.bind(this));
	input.addListener('end', this.onInputEnd.bind(this));
	input.addListener('error', this.onInputError.bind(this));

	return this.reset();
};

Crazyradio.prototype.reset = function()
{
	var self = this;

	this.arc = -1;
	this.address = new Buffer(5);
	this.address.fill(0xE7);

	return this.setChannel(self.channel)
		.then(self.setDataRate(self.datarate))
		.then(self.setContCarrier(false))
		.then(self.setAddress(self.address))
		.then(self.setPower(P_0DBM))
		.then(self.setAckRetryCount(3))
		.then(self.setARDBytes(32));
};

Crazyradio.prototype.close = function()
{
	var self = this,
		deferred = P.defer();

	this.interface.release(function(err)
	{
		if (err) deferred.reject(err);
		this.device = null;
		this.interface = null;
		this.inEndpoint = null;
		this.outEndpoint = null;
		deferred.resolve('OK');
	});

	return deferred.promise;
};

var EMPTY_BUFFER = new Buffer(0);

Crazyradio.prototype.setChannel = function(channel)
{
	return this.usbSendVendor(SET_RADIO_CHANNEL, channel, 0, EMPTY_BUFFER);
};

Crazyradio.prototype.setAddress = function(address)
{
	return this.usbSendVendor(SET_RADIO_ADDRESS, 0, 0, address);
};

Crazyradio.prototype.setDataRate = function(rate)
{
	return this.usbSendVendor(SET_DATA_RATE, rate, 0, EMPTY_BUFFER);
};

Crazyradio.prototype.setPower = function(level)
{
	return this.usbSendVendor(SET_RADIO_POWER, level, 0, EMPTY_BUFFER);
};

Crazyradio.prototype.setAckRetryCount = function(retries)
{
	this.arc = retries;
	return this.usbSendVendor(SET_RADIO_ARC, retries, 0, EMPTY_BUFFER);
};

Crazyradio.prototype.setAckRetryDelay = function(delay)
{
	/*
	Auto Retransmit Delay in microseconds
	0000 - Wait 250uS
	0001 - Wait 500uS
	0010 - Wait 750uS
	........
	1111 - Wait 4000uS
	*/
	var t = Math.floor(delay/250);
	if (t > 0xF)
		t = 0xF;

	return this.usbSendVendor(SET_RADIO_ARD, t, 0, EMPTY_BUFFER);
};

Crazyradio.prototype.setARDBytes = function(nbytes)
{
	return this.usbSendVendor(SET_RADIO_ARD, 0x80 | nbytes, 0, EMPTY_BUFFER);
};

Crazyradio.prototype.setContCarrier = function(active)
{
	return this.usbSendVendor(SET_CONT_CARRIER, (active ? 1 : 0), 0, EMPTY_BUFFER);
};

Crazyradio.prototype.scanChannels = function(start, stop, packet)
{
	var self = this;
	return self.usbSendVendor(SCAN_CHANNELS, start, stop, packet)
	.then(function(res)
	{
		return self.usbReceiveVendor(SCAN_CHANNELS, 0, 0, 64);
	})
	.fail(function(err)
	{
		console.log(err);
	});
};

Crazyradio.prototype.statusRequest = function()
{
	var self = this,
		deferred = P.defer();

	this.device.controlTransfer(usb.LIBUSB_ENDPOINT_IN, 0x06, 0, 0, 128, function(err, data)
	{
		if (err)
			return deferred.reject(err);

		deferred.resolve(data);
	});

	return deferred.promise;
};

// USB control transfer conveniences

Crazyradio.prototype.usbSendVendor = function(request, value, index, data)
{
	var self = this,
		deferred = P.defer();

	this.device.controlTransfer(TYPE_VENDOR, request, value, index, data, function(err, indata)
	{
		if (err)
		{
			console.log('usbSendVendor', err);
			console.log(TYPE_VENDOR, request, value, index, data);
			return deferred.reject(err);
		}

		// console.log('successful usbSendVendor', request);

		deferred.resolve('OK');
	});

	return deferred.promise;
};

Crazyradio.prototype.usbReceiveVendor = function(request, value, index, length)
{
	var self = this,
		deferred = P.defer();

	this.device.controlTransfer(TYPE_VENDOR | usb.LIBUSB_ENDPOINT_IN, request, value, index, length, function(err, data)
	{
		if (err)
		{
			console.log('usbReceiveVendor error:', err);
			return deferred.reject(err);
		}

		deferred.resolve(data);
	});

	return deferred.promise;
};

// --------------------------------------------

Crazyradio.prototype.onReadable = function()
{
	// TODO need to make sure we read one radio packet at a time, exactly
	var buf = this.inputStream().read();
	if (!buf || !buf.length)
		return;

	console.log('read buffer:', buf.length);
	console.log(buf[0], buf[1]);
	console.log(buf.slice(2).toString('ascii'));

	/*
	TODO
	The packet gets parsed enough that we know which channel it's addressed
	to. It then gets handed off to be parsed further & sent along to any subscribers
	to that kind of event.
	Handler types to write:
	radio acks for communication link quality reporting
	telemetry handlers (toc, logging data)
	parameter handlers (changing flie settings)
	*/
};

Crazyradio.prototype.onInputEnd = function()
{
	// TODO
};

Crazyradio.prototype.onInputError = function(err)
{
	console.log('usb stream input error:', err);
};

Crazyradio.prototype.write = function(data, timeout)
{
	var self = this, deferred = P.defer();
	this.outputStream().write(data, function()
	{
		deferred.resolve('OK');
	});

	return deferred.promise;
};

Crazyradio.prototype.sendPacket = Crazyradio.prototype.write;

// exports

module.exports        = Crazyradio;


