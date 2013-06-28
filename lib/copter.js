var
	_           = require('lodash'),
	assert      = require('assert'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	CrazyDriver = require('./crazydriver')
	;

var MAX_THRUST = 60000;
var MIN_THRUST = 10001;

var Copter = module.exports = function Copter(driver)
{
	events.EventEmitter.call(this);

	this.xmode           = false;
	this.driver          = driver || new CrazyDriver();
	this.state           = 0;
	this.currentSetpoint = {};
	this.goal =
	{
		roll:   0,
		pitch:  0,
		yaw:    0,
		thrust: 0
	};
	this.nextSetpoint =
	{
		roll:   0,
		pitch:  0,
		yaw:    0,
		thrust: 0
	};
};
util.inherits(Copter, events.EventEmitter);

Copter.prototype.connect = function(uri)
{
	var self = this;

	return self.driver.connect(uri)
	.then(function()
	{
		self.driver.onStabilizerTelemetry(self.handleStabilizerTelemetry.bind(self));
		self.driver.onMotorTelemetry(self.handleMotorTelemetry.bind(self));
		self.emit('ready');
	})
	.fail(function(err)
	{
		console.log(err);
		self.emit('error', err);
	})
	.done();
};

// Well, maybe I'll do it this way.
Copter.STATES =
{
	UNKNOWN:   0x0,
	CONNECTED: 0x1,
	READY:     0x2,
	LANDED:    0x3,
	FLYING:    0x4,
	TAKEOFF:   0x5,
	HOVER:     0x6,
	LANDING:   0x7,
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

//------------------------------
// High level control functions.

Copter.prototype.takeoff = function()
{
	// take off & hover.
	var self = this,
		deferred = P.defer();

	this.pulseTimer = setInterval(this.pulse.bind(this), 100);

	var maxThrust   = 39601;
	var minThrust   = 37700;
	var thrust      = minThrust;
	var thrustStep  = 500;
	var stepMS      = 250;
	var timeAtMax   = 4;
	var timeAtMin   = 2;
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
		// console.log('current timeCounter', timeCounter, '; thrust', thrust);
		self.thrust = thrust;
		self.goal.thrust = thrust;
	}

	this.hoverTimer = setInterval(hover, stepMS);
	return deferred.promise;
};

Copter.prototype.land = function()
{
	var self = this,
		deferred = P.defer();

	this.goToState(Copter.STATES.LANDING);

	var thrustStep = 1000;
	var stepMS = 250;

	if (this.hoverTimer)
		clearInterval(this.hoverTimer);

	function landCurve()
	{
		self.thrust -= thrustStep;
		if (self.thrust <= MIN_THRUST)
			self.thrust = MIN_THRUST;

		// console.log('landing; thrust:', self.thrust);

		if (self.thrust === MIN_THRUST)
		{
			self.goToState(Copter.STATES.LANDED);
			clearInterval(self.hoverTimer);
			deferred.resolve(self.state);
		}
	}

	this.hoverTimer = setInterval(landCurve, stepMS);

	return deferred.promise;
};

Copter.prototype.hover = function()
{
	this.goToState(Copter.STATES.HOVER);
};


Copter.prototype.goToState = function(newstate)
{
	// well, this is going to become more interesting
	this.state = newstate;
};

// Lower-level control functions.


Copter.prototype.pulse = function()
{
	return this.setpoint(
		this.nextSetpoint.roll,
		this.nextSetpoint.pitch,
		this.nextSetpoint.yaw,
		this.nextSetpoint.thrust
	);
};

Copter.prototype.setpoint = function(roll, pitch, yaw, thrust)
{
	if (this.xmode)
	{
		roll  = 0.707 * (roll - pitch);
		pitch = 0.707 * (roll + pitch);
	}

	this.currentSetpoint =
	{
		roll:   roll,
		pitch:  pitch,
		yaw:    yaw,
		thrust: thrust
	};

	return this.driver.setpoint(roll, pitch, yaw, thrust);
};


var EPSILON = 0.01;

Copter.prototype.handleStabilizerTelemetry = function(data)
{
	this.stabilizer = data;
	var roll    = 0,
		pitch   = 0,
		yaw     = 0,
		thrust  = this.goal.thrust;

	switch (this.state)
	{
	case Copter.STATES.HOVER:
		var diff = data.yaw - this.goal.yaw;
		if (Math.abs(diff) > EPSILON)
			yaw = diff;
		else
			yaw = 0;

		diff = data.pitch - this.goal.pitch;
		if (Math.abs(diff) > EPSILON)
			pitch = diff;
		else
			pitch = 0;

		this.yaw = yaw;
		this.pitch = pitch;
		break;

	default:
		// console.log('stabilizer:', data);
		break;
	}
};

Copter.prototype.setPitch = function(p)
{
	this.nextSetpoint.pitch = p;
};
Copter.prototype.getPitch = function() { return this.currentSetpoint.pitch; };
Copter.prototype.__defineGetter__('pitch', Copter.prototype.getPitch);
Copter.prototype.__defineSetter__('pitch', Copter.prototype.setPitch);

Copter.prototype.setYaw = function(y)
{
	this.nextSetpoint.yaw = y;
};
Copter.prototype.getYaw = function() { return this.currentSetpoint.yaw; };
Copter.prototype.__defineGetter__('yaw', Copter.prototype.getYaw);
Copter.prototype.__defineSetter__('yaw', Copter.prototype.setYaw);

Copter.prototype.setThrust = function(t)
{
	this.nextSetpoint.thrust = t;
};
Copter.prototype.getThrust = function() { return this.currentSetpoint.thrust; };
Copter.prototype.__defineGetter__('thrust', Copter.prototype.getThrust);
Copter.prototype.__defineSetter__('thrust', Copter.prototype.setThrust);

Copter.prototype.handleMotorTelemetry = function(data)
{
	// console.log('motor:', data);
};

Copter.prototype.shutdown = function()
{
	return this.driver.close();
};

// property boilerplate


