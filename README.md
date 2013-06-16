aerogel
=======

A node.js control library for the [Crazyflie](http://wiki.bitcraze.se/projects:crazyflie:userguide:index) nano-copter.

## Installation

[libusb](http://sourceforge.net/projects/libusb/) is required for the radio driver. On OS X, install with homebrew:

`brew install libusb`

Then install Aerogel:

`npm install aerogel`

Aerogel uses new-style node streams so it requires node 0.10.x or later.

## Basics

Telemetry information and other copter states are available as events you can listen for.

`stabilizer`

- roll
- pitch
- yaw

`motor`

- m1
- m2
- m3
- m4

## API

Aerogel exposes a promises API as well as a standard callback API. If you do not pass a callback to a method, a promise is returned. 


## To-do

## Contributing

Allman bracing, tabs to indent, camel case. Write tests in Mocha. [mocha-as-promised](https://github.com/domenic/mocha-as-promised) and [chai-as-promised](https://github.com/domenic/chai-as-promised/) are available. Do cool things.

## License

MIT.
