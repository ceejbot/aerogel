// Crazyradio should offer a method to take data in, format it properly
// using this constructor, and send it via sendPacket.
// Write/set functions are chainable.

function Crazypacket(data)
{
	if (data)
	{
		this.data = data;
		this._port = (this.data[0] & 0xF0) >> 4;
		this._channel = this.data[0] & 0x03;
		this.payload = data.slice(1);
		this._writable = false;
	}
	else
	{
		this.data = new Buffer(32);
		this.data.fill(0);
		this._writable = true;
	}
	this.pointer = 1;
}


// --------------------------------------------

Crazypacket.Ports =
{
	CONSOLE     : 0x00,
	PARAM       : 0x02,
	COMMANDER   : 0x03,
	LOGGING     : 0x05,
	DEBUGDRIVER : 0x0E,
	LINKCTRL    : 0x0F,
	ALL         : 0xFF,
};

Crazypacket.Channels =
{
	TOC:      0,
	SETTINGS: 1,
	LOGDATA:  2
};

Crazypacket.Commands =
{
	CREATE_BLOCK:  0,
	APPEND_BLOCK:  1,
	DELETE_BLOCK:  2,
	START_LOGGING: 3,
	STOP_LOGGING:  4,
	RESET_LOGGING: 5,
	GET_ELEMENT:   0,
	GET_INFO:      1
};

// --------------------------------------------
// chainable write methods

Crazypacket.prototype.resizeBuffer = function()
{
	var newbuf = new Buffer(this.data.length + 16);
	newbuf.fill(0);
	this.data.copy(newbuf);
	this.data = newbuf;
};

Crazypacket.prototype.writeFloat = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 4 >= this.data.length)
		this.resizeBuffer();

	this.data.writeFloatLE(value, this.pointer);
	this.pointer += 4;
	return this;
};

Crazypacket.prototype.writeUnsignedShort = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 2 >= this.data.length)
		this.resizeBuffer();

	this.data.writeUInt16LE(value, this.pointer);
	this.pointer += 2;
	return this;
};

Crazypacket.prototype.writeByte = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 1 >= this.data.length)
		this.resizeBuffer();

	this.data.writeUInt8(value, this.pointer);
	this.pointer++;
	return this;
};

Crazypacket.prototype.endPacket = function()
{
	if (!this._writable)
		return;

	this.data = this.data.slice(0, this.pointer);
	this._writable = false;
	return this;
};

// header management

Crazypacket.prototype.updateHeader = function()
{
	this.data[0] = ((this._port & 0x0f) << 4 | 0x3 << 2 | (this._channel & 0x03));
};

Crazypacket.prototype.getHeader = function()
{
	return this.data[0];
};

Crazypacket.prototype.setHeader = function(value)
{
	this.data[0] = value;
	return this;
};

Crazypacket.prototype.__defineGetter__('header', Crazypacket.prototype.getHeader);
Crazypacket.prototype.__defineSetter__('header', Crazypacket.prototype.setHeader);

Crazypacket.prototype.setChannel = function(value)
{
	this._channel = value;
	this.updateHeader();
	return this;
};

Crazypacket.prototype.getChannel = function(value)
{
	return this._channel;
};

Crazypacket.prototype.__defineGetter__('channel', Crazypacket.prototype.getChannel);
Crazypacket.prototype.__defineSetter__('channel', Crazypacket.prototype.setChannel);


Crazypacket.prototype.setPort = function(value)
{
	this._port = value;
	this.updateHeader();
	return this;
};

Crazypacket.prototype.getPort = function(value)
{
	return this._port;
};

Crazypacket.prototype.__defineGetter__('port', Crazypacket.prototype.getPort);
Crazypacket.prototype.__defineSetter__('port', Crazypacket.prototype.setPort);


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
	this.packet = new Crazypacket(this.data);
};

// --------------------------------------------

module.exports      = Crazypacket;
Crazypacket.Ack = RadioAck;
