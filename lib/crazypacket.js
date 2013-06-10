var CRTPPorts =
{
	CONSOLE     : 0x00,
	PARAM       : 0x02,
	COMMANDER   : 0x03,
	LOGGING     : 0x05,
	DEBUGDRIVER : 0x0E,
	LINKCTRL    : 0x0F,
	ALL         : 0xFF,
};

var CRTPChannels =
{
	TOC: 0
};


// Crazyradio should offer a method to take data in, format it properly
// using this constructor, and send it via sendPacket.
// Write/set functions are chainable.

function CRTPPacket(data)
{
	this.data = data;
	if (data)
	{
		this.data = data;
		this._port = (this.data[0] & 0xF0) >> 4;
		this._channel = this.data[0] & 0x03;
		this._writable = false;
	}
	else
	{
		this.data = new Buffer(16);
		this.data.fill(0);
		this._writable = true;
	}
	this.pointer = 1;
}

// chainable write methods

CRTPPacket.prototype.resizeBuffer = function()
{
	var newbuf = new Buffer(this.data.length + 16);
	newbuf.fill(0);
	this.data.copy(newbuf);
	this.data = newbuf;
};

CRTPPacket.prototype.writeFloat = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 4 >= this.data.length)
		this.resizeBuffer();

	this.data.writeFloatLE(value, this.pointer);
	this.pointer += 4;
	return this;
};

CRTPPacket.prototype.writeUnsignedShort = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 2 >= this.data.length)
		this.resizeBuffer();

	this.data.writeUInt16LE(value, this.pointer);
	this.pointer += 2;
	return this;
};

CRTPPacket.prototype.writeByte = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 1 >= this.data.length)
		this.resizeBuffer();

	this.data.writeInt8(value, this.pointer);
	this.pointer++;
	return this;
};

CRTPPacket.prototype.endPacket = function()
{
	if (!this._writable)
		return;

	this.data = this.data.slice(0, this.pointer);
	this._writable = false;
	return this;
};

// header management

CRTPPacket.prototype.updateHeader = function()
{
	this.data[0] = ((this._port & 0x0f) << 4 | 0x3 << 2 | (this._channel & 0x03));
};

CRTPPacket.prototype.header = function()
{
	return this.data[0];
};

CRTPPacket.prototype.setChannel = function(value)
{
	this._channel = value;
	this.updateHeader();
	return this;
};

CRTPPacket.prototype.getChannel = function(value)
{
	return this._channel;
};

CRTPPacket.prototype.__defineGetter__('channel', CRTPPacket.prototype.getChannel);
CRTPPacket.prototype.__defineSetter__('channel', CRTPPacket.prototype.setChannel);


CRTPPacket.prototype.setPort = function(value)
{
	this._port = value;
	this.updateHeader();
	return this;
};

CRTPPacket.prototype.getPort = function(value)
{
	return this._port;
};

CRTPPacket.prototype.__defineGetter__('port', CRTPPacket.prototype.getPort);
CRTPPacket.prototype.__defineSetter__('port', CRTPPacket.prototype.setPort);

// --------------------------------------------

function RadioAck(buffer)
{
	this.ack = false;
	this.powerDet = false;
	this.retry = 0;
	this.data = undefined;

	if (buffer)
		this.parse(buffer);
}

RadioAck.prototype.parse = function(buffer)
{
	this.ack = (buffer[0] & 0x01) !== 0;
	this.powerDet = (buffer[0] & 0x02) !== 0;
	this.retry = buffer[0] >> 4;
	this.data = buffer.slice(1);
	this.packet = new CRTPPacket(this.data);
};

// --------------------------------------------

module.exports      = CRTPPacket;
CRTPPacket.Ports    = CRTPPorts;
CRTPPacket.Channels = CRTPChannels;
CRTPPacket.RadioAck = RadioAck;
