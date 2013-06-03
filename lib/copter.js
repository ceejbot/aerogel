var
	_           = require('lodash'),
	assert      = require('assert'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	CrazyDriver = require('./crazydriver')
	;


var COPTER_STATES =
{
	UNKNOWN:   0x0,
	CONNECTED: 0x1,
	READY:     0x2,
	LANDED:    0x3,
	FLYING:    0x4,
	// etc
	UNUSED08:  0x8,
	UNUSED09:  0x9,
	UNUSED10:  0xA,
	UNUSED11:  0xB,
	UNUSED12:  0xC,
	UNUSED13:  0xD,
	UNUSED14:  0xE,
	UNUSED15:  0xF,
};


function Copter()
{
	events.EventEmitter.call(this);

	this.xmode = false;
	this.driver = new CrazyDriver();

}
util.inherits(Copter, events.EventEmitter);

Copter.prototype.connect = function(uri)
{
	return this.driver.connect(uri);
};

// High level control functions.


Copter.prototype.takeoff = function()
{
	// take off & hover with a fixed thrust.
	var self = this;
	function hover()
	{
		self.setpoint(0, 0, 0, 10001);
	}

	this.hoverTimer = setInterval(hover, 1000);

};

Copter.prototype.land = function()
{
	// as our "simple working system" from which a complex system shall evolve...
	if (this.hoverTimer)
		clearInterval(this.hoverTimer);
};



// Lower-level control functions.

Copter.prototype.setpoint = function(roll, pitch, yaw, thrust)
{
	if (this.xmode)
	{
		roll = 0.707 * (roll - pitch);
		pitch = 0.707 * (roll + pitch);
	}

	return this.driver.setpoint(roll, pitch, yaw, thrust);
};

// Functions for: request telemetry, errrrr

Copter.prototype.shutdown = function()
{
	return this.driver.close();
};

module.exports = Copter;

