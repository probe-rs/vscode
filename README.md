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




