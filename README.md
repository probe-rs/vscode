# VS Code probe-rs-debugger


## Documentation
Full documentation on Installation, Configuration and supported functionality can be found at [the probe-rs webpage](https://probe.rs/docs/tools/vscode/)

![probe-rs-debugger](images/probe-rs-debugger.gif)  
Images above taken while using the [Micro Rust sample application](https://github.com/titanclass/microrust-start)

## Development Setup

To work on this extensions, you first need to install VS Code and nodejs. Afterwards, follow the following steps:

- Install yarn:
  ```bash
  npm install -g yarn
  ```
- Checkout this repository
- Inside the repository, install the prerequisites:
  ```bash
  yarn
  ```
- Install a VS Code extension necessary for development:
  ```bash
  code --install-extension amodio.tsl-problem-matcher
  ```
- Open VS Code
- Press F5 to start a new VS Code instance where the extension can be debugged. You can also open the "Run and Debug" panel in the left sidebar, and then start the "Extension" debug configuration.


### To run against a compiled executable of `probe-rs-debugger`

* Modify the `debug-example` entry in '.vscode/launch.json' file to point to your target project.
* Press `F5` to __build and launch executable__ `probe-rs-debugger`. VSCode will open another VS Code window. In that window,
  * You will see the `debug-example` project you just configured.
* Select the debug environment `probe_rs Executable Test`.* Press `F5` to start debugging.
  
### To run against a debuggable instance of `probe-rs-debugger`

* Clone the [probe-rs](https://github.com/probe-rs/probe-rs.git) repository, and open it in VSCode. 
  * In this `probe-rs` repo, select the debug environment `DAP-Server probe-rs-debugger`
  * Press `F5` to start `probe-rs-debugger` as a debuggable server.
* Switch to the VSCode instance of the probe-rs `vscode` repository. 
  * Modify the `debug-example` entry in '.vscode/launch.json' file to point to your target project.
  * Press `F5` to __build and attach to the debuggable server instance of__ `probe-rs-debugger`. VSCode will open another VS Code window. In that window:
  * You will see the `debug-example` project you just configured.
  * Select the debug environment `probe_rs Server Test`.
  * Press `F5` to start debugging.



