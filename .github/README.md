# VS Code probe-rs dap-server

## Documentation

Full documentation on [Installation](https://probe.rs/docs/tools/debugger/#installation), [Configuration](https://probe.rs/docs/tools/debugger/#usage-and-configuration) and [supported functionality](https://probe.rs/docs/tools/debugger/#current-working-functionality-and-known-limitations)
can be found at [the probe-rs webpage](https://probe.rs/docs/tools/debugger/) and
under the [visual tour
heading](https://probe.rs/docs/tools/debugger/#a-visual-guide-of-implemented-features)

<img style="margin-top: 1em; margin-bottom: 1em; max-width:100%; max-height:100%; width: auto; height: auto;" src="https://probe.rs/images/probe-rs-debugger.gif" />

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

### To run against a compiled executable of `probe-rs`

* Press `F5` to __build and launch executable__ `probe-rs`. VSCode will
  open another VS Code window, titled __[Extension Development Host]__.
* In this new VSCode window,
  * Open an existing project, or create a new one.
  * In your project, configure the `launch.json` in your project, as per [the minimum configuration](https://probe.rs/docs/tools/debugger/#start-a-debug-session-with-minimum-configuration) example.
  * Select the debug environment you just created.
    * Press `F5` to start debugging.

### To run against a debuggable instance of `probe-rs`

* Clone the [probe-rs](https://github.com/probe-rs/probe-rs.git) repository, and
  open it in VSCode.
  * In this `probe-rs` repo, select the debug environment `DAP-Server
    probe-rs`
  * Press `F5` to start `probe-rs` as a debuggable server.
* Switch to the VSCode instance of the probe-rs `vscode` repository.
* In this new VSCode window,
  * Open an existing project, or create a new one.
  * In your project, configure the `launch.json` in your project, as per [the standalong debugger server](https://probe.rs/docs/tools/debugger/#connecting-to-a-standalone-probe-rs-dap-server-server) example.
  * Select the debug environment you just created.
    * Press `F5` to start debugging.

### Build the extension

Building the extension refers to the process that generates the installable
`.vsix` package.

* Follow the instructions to [setup your development
  environment](#development-setup).
* In a terminal window, execute the following command:

      npm run package

* This will generate a .vsix file in the root of the repository

### Releasing the extension

- The extension can only be released as part of the CI process on GitHub Actions.
- The CI process is defined in `.github/publish.yml`.
- Whenever a PR is merged, The CI process will also automatically build the extension, and:
  - If the version number was bumped in `package.json`, it will publish the
    extension to the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=probe-rs.probe-rs-debugger).
  - If the version number was not bumped, no publishing will occur.

## Contributing

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall
be dual licensed, without any additional terms or conditions, according to:
 * Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or
   http://www.apache.org/licenses/LICENSE-2.0)
 * MIT license ([LICENSE-MIT](LICENSE-MIT) or
   http://opensource.org/licenses/MIT) at your option.
