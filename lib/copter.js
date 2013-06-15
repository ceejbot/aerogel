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


var MAX_THRUST = 60000;
var MIN_THRUST = 10001;


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

	var maxThrust = 39601;
	var minThrust = 37700;
	var thrust = minThrust;
	var thrustStep = 500;
	var stepMS = 250;
	var timeAtMax = 4;
	var timeAtMin = 2;
	var timeCounter = 0;

	function hover()
	{
		if (thrust === 0)
			return;
		if (timeCounter === 0)
		{
			thrust += thrustStep;
			if (thrust >= maxThrust)
			{
				thrust = maxThrust;
				timeCounter = 1;
			}
		}
		else if (timeCounter >= timeAtMax)
		{
			thrust -= thrustStep;
			if (thrust < minThrust)
			{
				if (timeCounter >= timeAtMax + timeAtMin)
				{
					deferred.resolve('OK');
					thrust = 0;
					return;
				}
				else
				{
					timeCounter += 1;
					thrust = minThrust;
				}
			}
		}
		else
			timeCounter += 1;
		console.log('current timeCounter', timeCounter, '; thrust', thrust);
		self.setpoint(0, 0, 0, thrust);
		self.thrust = thrust;
	}

	this.hoverTimer = setInterval(hover, stepMS);
	return deferred.promise;
};

Copter.prototype.land = function()
{
	var self = this,
		deferred = P.defer();

	var thrustStep = 750;
	var stepMS = 250;

	if (this.hoverTimer)
		clearInterval(this.hoverTimer);

	function landCurve()
	{
		self.thrust -= thrustStep;
		if (self.thrust <= MIN_THRUST)
			self.thrust = MIN_THRUST;

		self.setpoint(0, 0, 0, self.thrust);
		// console.log('landing; thrust:', self.thrust);

		if (self.thrust === MIN_THRUST)
			clearInterval(self.hoverTimer);
	}

	this.hoverTimer = setInterval(landCurve, stepMS);

	return deferred.promise;
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
		console.log('ack:', ack);
	});
};

// Functions for: request telemetry, errrrr

Copter.prototype.startTelemetry = function()
{
	return this.driver.requestTOC();
};


Copter.prototype.shutdown = function()
{
	return this.driver.close();
};

module.exports = Copter;

