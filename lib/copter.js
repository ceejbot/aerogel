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
	TAKEOFF:   0x5,
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


function Copter(driver)
{
	events.EventEmitter.call(this);

	this.xmode = false;
	this.driver = driver || new CrazyDriver();

	this.thrust = 0;
	this.state = 0;

}
util.inherits(Copter, events.EventEmitter);

Copter.prototype.connect = function(uri)
{
	return this.driver.connect(uri);
};

// High level control functions.


Copter.prototype.takeoff = function()
{
	// take off & hover.
	var self = this,
		deferred = P.defer();

	var thrust = 40001;
	var state = 0;

	function hover()
	{
		console.log('current state', state, '; thrust', thrust);
		self.setpoint(0, 0, 0, thrust);
		if ((thrust < 40000) && (state === 0))
		{
			thrust += 1000;
		}
		else if (state === 5)
		{
			thrust -= 1000;
			if (thrust < 38000)
			{
				deferred.resolve('OK');
			}
		}
		else if (thrust >= 40000)
			state += 1;
	}

	this.hoverTimer = setInterval(hover, 250);
	return deferred.promise;
};

Copter.prototype.land = function()
{
	// as our "simple working system" from which a complex system shall evolve...
	if (this.hoverTimer)
		clearInterval(this.hoverTimer);

	return this.setpoint(0, 0, 0, 0);
};



// Lower-level control functions.

Copter.prototype.setpoint = function(roll, pitch, yaw, thrust)
{
	if (this.xmode)
	{
		roll = 0.707 * (roll - pitch);
		pitch = 0.707 * (roll + pitch);
	}

	this.driver.setpoint(roll, pitch, yaw, thrust)
	.then(function(ack)
	{
		console.log(ack.slice(2).toString('ascii'));
	});
};

// Functions for: request telemetry, errrrr

Copter.prototype.shutdown = function()
{
	return this.driver.close();
};

module.exports = Copter;

