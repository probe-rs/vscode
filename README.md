# VS Code probe-rs-debugger

## Documentation

Full documentation on [Installation](https://probe.rs/docs/tools/vscode/#installation), Configuration and supported functionality
can be found at [the probe-rs webpage](https://probe.rs/docs/tools/vscode/) and
under the [visual tour
heading](https://probe.rs/docs/tools/vscode/#a-visual-guide-of-implemented-features)

<img style="margin-top: 1em; margin-bottom: 1em; max-width:100%; max-height:100%; width: auto; height: auto;" src="https://probe.rs/img/vscode/probe-rs-debugger.gif" />

## Development Setup - only applies if you want to contribute to the extension

To work on this extensions, you first need to install VS Code and nodejs.
Afterwards, follow the following steps:

* Checkout this repository
* Inside the repository, install the prerequisites:

      npm install

* Install the extensions VS Code recommends. If you prefer to do this manually,
  you can find the list of recommended extensions in the repository's
  `.vscode/settings.json' file. These can then be installed from the command
  line, for example:

      code --install-extension amodio.tsl-problem-matcher

* Open VS Code
* Press F5 to start a new VS Code instance where the extension can be debugged.
  You can also open the "Run and Debug" panel in the left sidebar, and then
  start the "Extension" debug configuration.

### To run against a compiled executable of `probe-rs-debugger`

* Modify the `debug-example` entry in '.vscode/launch.json' file to point to
  your target project.
* Press `F5` to __build and launch executable__ `probe-rs-debugger`. VSCode will
  open another VS Code window. In that window,
  * You will see the `debug-example` project you just configured.
* Select the debug environment `probe_rs Executable Test`.* Press `F5` to start
  debugging.

### To run against a debuggable instance of `probe-rs-debugger`

* Clone the [probe-rs](https://github.com/probe-rs/probe-rs.git) repository, and
  open it in VSCode.
  * In this `probe-rs` repo, select the debug environment `DAP-Server
    probe-rs-debugger`
  * Press `F5` to start `probe-rs-debugger` as a debuggable server.
* Switch to the VSCode instance of the probe-rs `vscode` repository.
  * Modify the `debug-example` entry in '.vscode/launch.json' file to point to
    your target project.
  * Press `F5` to __build and attach to the debuggable server instance of__
    `probe-rs-debugger`. VSCode will open another VS Code window. In that
    window:
  * You will see the `debug-example` project you just configured.
  * Select the debug environment `probe_rs Server Test`.
  * Press `F5` to start debugging.

## Releasing the extension

The extension is released as part of the CI process on GitHub Actions.

### Build the extension

Building the extension refers to the process that generates the installable
`.vsix` package.

* Follow the instructions to [setup your development
  environment](#development-setup).
* In a terminal window, execute the following command:

      npm run package

* This will generate a .vsix file in the root of the repository

## Contributing

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall
be dual licensed as above, without any additional terms or conditions.
