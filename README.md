# VS Code probe-rs-debugger

## Using probe-rs-debugger

* Install the **probe-rs-debugger** extension in VS Code, by downloading the latest `probe-rs-debugger-0.2.1.vsix` from the [Releases](https://github.com/probe-rs/vscode/releases) page in this repo (we will publish to the Microsoft Extension marketplace in due course)
  * Install the extension by running `code --install-extension probe-rs-debugger-0.2.1.vsix` in the terminal
  * To generate the extension ...(if you wish to update the version distributed with this repository)
    * Run `yarn` in the terminal to update all dependencies.
    * Package the extension with `yarn package`.
* Install the **probe-rs-debugger** server component, using instructions from [probe-rs-debugger](https://github.com/probe-rs/probe-rs/tree/master/debugger)

* Configure your own VSCode project as per instructions below. This repo also contains a [debug-example](https://github.com/probe-rs/vscode/tree/master/debug_example) folder, with a fully functional Embedded Rust environment on a STM32H745ZI-Q Nucleo board.
  * If you install using the extension `.vsix`, then the example folder can be found your home directory, usually something like `~/.vscode/extensions/probe-rs.probe-rs-debugger-0.2.1/debug_example`

![probe-rs-debugger](images/probe-rs-debugger.gif)

## Sample `launch.json`
```
{
    "version": "0.2.0",
    "configurations": [
        {
            "preLaunchTask": "${defaultBuildTask}",
            "type": "probe-rs-debug",
            "request": "launch",
            "name": "probe_rs Executable Test",
            "cwd": "${workspaceFolder}",
            "program_binary": "target/thumbv7em-none-eabihf/debug/debugging_variables",
            "chip": "STM32H745ZITx",
            "connect_under_reset": true,
            "speed": 24000,
            // "probe": "PID:VID:<Serial>",
            "runtimeExecutable": "probe-rs-debugger",
            "runtimeArgs": [
                "debug",
                "--dap"
            ],
            "core_index": 0,
            "flashing_enabled": true,
            "reset_after_flashing": true,
            "halt_after_reset": true,
            "console_log_level": "Error"
        },
        {
            "preLaunchTask": "${defaultBuildTask}",
            "type": "probe-rs-debug",
            "request": "attach",
            "name": "probe_rs Server Test",
            "server": "127.0.0.1:50001",
            "cwd": "${workspaceFolder}",
            "program_binary": "./target/thumbv7em-none-eabihf/debug/debugging_variables",
            "chip": "STM32H745ZITx",
            "connect_under_reset": true,
            "speed": 24000,
            // "probe": "PID:VID:<Serial>",
            "core_index": 0,
            "flashing_enabled": true,
            "reset_after_flashing": true,
            "halt_after_reset": false,
            "console_log_level": "Info"            
        }
    ]
}
```

## Current working functionality and known limitations
- [x] **Launch**: Automatcially launch probe-rs-debugger executable and connect to it, or ...
- [x] **Attach**: Use TCIP/IP port to connect to an existing probe-rs-debugger server
- [x] **Connect** to probe with probe-rs 
  - [x] Supports `connect-under-reset`
  - [ ] Only tested against STM32H745, using the Cortex-M7 core of this multi-core chip.
- [x] **Flash** the chip with your own binary. 
  - [x] Supports `reset-after-flashing`
  - [x] Supports `halt-after-reset`. This will allow you to set breakpoints in your main() function.
- [x] Set, clear, disable, enable **Breakpoints**
  - [ ] TODO: There is a known issue that prevents too many changes to breakpoints in one session. If you run into it, just restart your session.
- [x] **Step Over** executing code
  - [x] Step Over works at 'instruction' granularity, so sometimes requires multiple steps per line of code
  - [ ] Stepping at 'line' level, Step Into, Step Out, does not work yet
- [x] **Variables View**
  - [x] View values of core **Registers**, and changes during code execution
    - [ ] TODO: Expand to show additional architecture registers
  - [x] View values of **Locals** variables, and changes during code execution.
    - [x] Shows datatypes and values for the following Rust datatypes.
      - [x] Base types, including &str
      - [x] Enumerations
      - [x] Structures
      - [x] Pointers
      - [x] Variants
    - [ ] TODO: Add support for all data types, such as Arrays, Unions, Generics, etc.
    - [x] FIXED: Filter the list of local variables to ONLY display variables that are in scope of the current register PC value. Currently ALL local variables are shown.
  - [ ] TODO: Expose **Static** and **Global** variables
- [x] **Call Stack View**
  - [x] Supports a single thread, for a single core of the chip, but will **allow selection of any frames** that are in the current thread
  - [ ] TODO: Support multiple threads
  - [ ] TODO: Support chips with multiple cores
- [ ] TODO: **Watch View** Nothing yet
- [ ] TODO: **ITM** and **RTT**
- [ ] TODO: Enable Debug Console to accept CLI commands via REPL

## Build and Run

* Open the project folder in VS Code.
* Open a terminal and run the `yarn` command, to install VSCode development dependencies
* Press `F5` to build and launch probe-rs-debugger in another VS Code window. In that window:
  * You will see the debug-example project, which may require some changes if you have a different chip or board.
  * Select the debug environment "probe_rs Executable Test".
  * Press `F5` to start debugging.
