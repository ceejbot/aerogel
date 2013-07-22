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

Crazypacket.readType = function(buffer, type, offset)
{
	switch(type)
	{
	case 'uint8_t':
		return buffer.readUInt8(offset);

	case 'uint16_t':
		return buffer.readUInt16LE(offset);

	case 'uint32_t':
		return buffer.readUInt32LE(offset);

	case 'uint64_t':
		return buffer.readUInt64LE(offset);

	case 'int8_t':
		return buffer.readInt8(offset);

	case 'int16_t':
		return buffer.readInt16LE(offset);

	case 'int32_t':
		return buffer.readInt32LE(offset);

	case 'int64_t':
		return buffer.readInt64LE(offset);

	case 'float':
		return buffer.readFloatLE(offset);

	case 'double':
		return buffer.readDoubleLE(offset);

	default:
		// log?
		return 0;
	}
};

Crazypacket.prototype.writeType = function(type, value)
{
	switch(type)
	{
	case 'uint8_t':
		return this.writeByte(value);

	case 'uint16_t':
		return this.writeUnsignedShort(value);

	case 'uint32_t':
		return this.writeUnsignedLong(value);

	case 'uint64_t':
		return this.writeUnsignedLongLong(value);

	case 'int8_t':
		return this.writeInt(value);

	case 'int16_t':
		return this.writeShort(value);

	case 'int32_t':
		return this.writeLong(value);

	case 'int64_t':
		return this.writeLongLong(value);

	case 'float':
		return this.writeFloat(value);

	case 'double':
		return this.writeDouble(value);

	default:
		// log?
		return this;
	}
};

// --------------------------------------------
// chainable write methods
// This is sugar so you never have to resize your buffer & to track how many
// bytes we need to write over the radio.

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

Crazypacket.prototype.writeDouble = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 8 >= this.data.length)
		this.resizeBuffer();

	this.data.writeDoubleLE(value, this.pointer);
	this.pointer += 8;
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

Crazypacket.prototype.writeUnsignedLong = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 4 >= this.data.length)
		this.resizeBuffer();

	this.data.writeUInt32LE(value, this.pointer);
	this.pointer += 4;
	return this;
};

Crazypacket.prototype.writeUnsignedLongLong = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 8 >= this.data.length)
		this.resizeBuffer();

	this.data.writeUInt64LE(value, this.pointer);
	this.pointer += 8;
	return this;
};

//

Crazypacket.prototype.writeInt = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 1 >= this.data.length)
		this.resizeBuffer();

	this.data.writeInt8(value, this.pointer);
	this.pointer++;
	return this;
};

Crazypacket.prototype.writeShort = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 2 >= this.data.length)
		this.resizeBuffer();

	this.data.writeInt16LE(value, this.pointer);
	this.pointer += 2;
	return this;
};

Crazypacket.prototype.writeLong = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 4 >= this.data.length)
		this.resizeBuffer();

	this.data.writeInt32LE(value, this.pointer);
	this.pointer += 4;
	return this;
};

Crazypacket.prototype.writeLongLong = function(value)
{
	if (!this._writable)
		return;
	if (this.pointer + 8 >= this.data.length)
		this.resizeBuffer();

	this.data.writeInt64LE(value, this.pointer);
	this.pointer += 8;
	return this;
};

// ready to write over the radio...
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

module.exports = Crazypacket;
Crazypacket.Ack = RadioAck;
