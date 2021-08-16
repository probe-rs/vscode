//This is meant to do some basic to complex testing of debugging types.
//The code is a random compilation from the rust-lang tests in github
#![no_main]
#![no_std]
#![allow(warnings)]
#![allow(unsafe_code)]
#![allow(unused_variables)]
#![allow(dead_code)]

use core::fmt::Debug;
use core::result;
use cortex_m_rt::entry;
use hal::gpio::{Edge, ExtiPin, Floating, Input};
use hal::gpio::{Output, PushPull};
use hal::hal::digital::v2::ToggleableOutputPin;
use hal::prelude::*;
use hal::stm32::TIM2;
use hal::timer::{Event, Timer};
use hal::{gpio::gpiob::PB14, hal::digital::v2::OutputPin}; //Pushuser_button on PC13, board_red_led33 (Red) on PB14
use heapless::Vec;
use panic_halt as _;
use rtt_target::{UpChannel, DownChannel, rtt_init, set_print_channel,rprint ,rprintln};
use stm32h7xx_hal as hal;

// N.B. These are `mut` only so they don't constant fold away.
static mut B: bool = false;
static mut I: isize = -1;
static mut C: char = 'a';
static mut I8: i8 = 68;
static mut I16: i16 = -16;
static mut I32: i32 = -32;
static mut I64: i64 = -64;
static mut U: usize = 1;
static mut U8: u8 = 100;
static mut U16: u16 = 16;
static mut U32: u32 = 32;
static mut U64: u64 = 64;
static mut F32: f32 = 2.5;
static mut F64: f64 = 3.5;

static GLOBAL_STATIC: &str = "A 'global' static variable";
const GLOBAL_CONSTANT: &str =
    "This value will only show up in the debugger in the variables where it is referenced";

use self::Regular::{Case1, Case2};
use self::Univariant::TupleOfComplexStruct;

struct ComplexStruct {
    x: i64,
    y: i32,
    z: i16,
}

// The first element is to ensure proper alignment, irrespective of the machines word size. Since
// the size of the discriminant value is machine dependent, this has be taken into account when
// datatype layout should be predictable as in this case.
enum Regular {
    Case1(u64, ComplexStruct),
    Case2(u64, u64, i16),
}

enum Univariant {
    TupleOfComplexStruct(ComplexStruct, ComplexStruct),
}

static REGULAR_STRUCT: Regular = Case1(
    0,
    ComplexStruct {
        x: 24,
        y: 25,
        z: 26,
    },
);
#[entry]
fn main() -> ! {
    static LOCAL_STATIC: &str = "A 'local' to main() static variable";

    let rtt_channels = rtt_init! {
        up: {
            0: {
                size: 1024
                name: "String RTT Channel"
            }
            1: {
                size: 1024
                name: "BinaryLE RTT Channel"
            }
            // 2: {
            //     size: 1024
            //     name: "defmt RTT Channel"
            // }
        }
        down: {
            0: {
                size: 16
                name: "String RTT Channel"
            }
            1: {
                size: 16
                name: "BinaryLE RTT Channel"
            }
            // 2: {
            //     size: 16
            //     name: "defmt RTT Channel"
            // }
        }
    };
    // Setup to use rprintln to channel 0
    set_print_channel(rtt_channels.up.0);
    rprintln!("Debug Example Application Started Successfully");

    // Setup to use UpChannel::write() to channel 1
    let mut binary_rtt_channel:UpChannel = rtt_channels.up.1;

    // Device specific peripherals
    let mut stm32h7_peripherals: hal::pac::Peripherals = hal::pac::Peripherals::take().unwrap();
    let mut cortex_peripherals: cortex_m::peripheral::Peripherals =
        cortex_m::Peripherals::take().unwrap();

    let my_peripheral_reference = &mut stm32h7_peripherals;

    //Configure SLEEP mode (not DEEP SLEEP) and FLASH for fast wakup after WFI
    //Configure SLEEP mode
    cortex_peripherals.SCB.clear_sleepdeep(); //Regular SLEEP mode for fastest exit
    cortex_peripherals.SCB.clear_sleeponexit(); // do not reenter low-power mode after ISR
                                                //stm32h7_peripherals.FLASH.acr.write(|w| w.)
                                                //FLASH->ACR &= ~FLASH_ACR_SLEEP_PD; // emTODO: Ensure Flash memory stays on

    // Setting up the board to run with a clock speed of 400mhz;
    let clock_speed: u32 = 400;
    stm32h7_peripherals
        .PWR
        .cpucr
        .modify(|_, w| w.run_d3().set_bit()); //Ensure Domain 3 run in SLEEP
    let pwr = stm32h7_peripherals.PWR.constrain();
    let pwrcfg = pwr.smps().freeze();
    if pwrcfg.vos() != hal::pwr::VoltageScale::Scale1 {
        panic!("PowerConfig Voltage scale could not select Scale 1");
    };
    let rcc = stm32h7_peripherals.RCC.constrain();
    let ccdr = rcc
        .bypass_hse()
        .sys_ck(clock_speed.mhz()) //Implies use PLL clock pll1_p_ck
        .hclk((clock_speed / 2).mhz())
        .pclk4(4.mhz())
        .per_ck(4.mhz())
        .freeze(pwrcfg, &stm32h7_peripherals.SYSCFG);

    //Confirm clocks are enabled as we expect
    // assert_eq!(ccdr.clocks.sys_ck().0, clock_speed * 1_000_000, "Could not set system clock to 400Mhz");
    // assert_eq!(ccdr.clocks.hclk().0, clock_speed * 1_000_000 / 2, "Could not set hclk to 200Mhz");
    // assert_eq!(ccdr.clocks.per_ck().unwrap().0, 4_000_000, "Could not set Peripheral Clock to 4Mhz");

    if cortex_m::peripheral::DCB::is_debugger_attached() {
        let inside_an_if_statement = true;
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.d1dbgcken().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.d3dbgcken().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.traceclken().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.dbgsleep_d1().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.dbgstop_d1().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.dbgstby_d1().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.dbgsleep_d2().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.dbgstop_d2().set_bit());
        stm32h7_peripherals
            .DBGMCU
            .cr
            .modify(|_, w| w.dbgstby_d2().set_bit());
        // info!("DBGMCU d1dbgsleep is : {:?}", stm32h7_peripherals.DBGMCU.cr.read().dbgsleep_d1().bit());
    }

    let tick_counter =
        stm32h7_peripherals
            .TIM2
            .tick_timer(32.khz(), ccdr.peripheral.TIM2, &ccdr.clocks);

    // Access to the GPIO groups we need
    let gpiob = stm32h7_peripherals
        .GPIOB
        .split_without_reset(ccdr.peripheral.GPIOB);

    let mut board_red_led = gpiob.pb14.into_push_pull_output();

    let int8: i8 = 23;
    let int128: i128 = -196710231994021419720322;
    let u_int128: u128 = 196710231994021419720322;
    let float64: f64 = 56.7 / 32.2; //1.760869565217391
    let float64_ptr = &float64;
    let emoji = '💩';
    let emoji_ptr = &emoji;
    let mut true_bool = false;
    true_bool = true;
    let any_old_string_slice = "How long is a piece of String.";
    let function_result = basic_types_with_err_result();
    let global_types = unsafe { (B, I, C, I8, I16, I32, I64, U, U8, U16, U32, U64, F32, F64) };

    let firstCaseOfStructVariants = Case1(
        0,
        ComplexStruct {
            x: 24,
            y: 25,
            z: 26,
        },
    );
    let secondCaseOfStructVariants = Case2(0, 1023, 1967);
    let structWithOneVariant = TupleOfComplexStruct(
        ComplexStruct {
            x: 24,
            y: 25,
            z: 26,
        },
        ComplexStruct {
            x: -3,
            y: -2,
            z: -1,
        },
    );

    let a1 = assoc_struct(Struct { b: -1, b1: 0 });
    let a2 = assoc_local(1);
    let a3 = assoc_arg::<i32>(2);
    let a4 = assoc_return_value(3);
    let a5 = assoc_tuple((4, 5));
    let a6 = assoc_enum(Enum::Variant1(6, 7));
    let a7 = assoc_enum(Enum::Variant2(8, 9));

    let my_array = [55; 10];
    let my_array_ptr = &my_array;
    let my_array_of_i8: [i8; 10] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    let mut heapless_vec = Vec::<i8, 10>::new();
    heapless_vec.push(1);
    heapless_vec.push(2);
    heapless_vec.push(3);

    let mut i:u8 = 0;
    loop {
        
        i = i.wrapping_add(1); //Wrap when u8 overflows
        let bytes_written = binary_rtt_channel.write(&u8::to_le_bytes(i)); // Raw byte level output to Channel 1
        rprintln!("Loop count # {}, wrote {}  bytes to the BinaryLE channel #1", i, bytes_written); // Text Output line on Channel 0
        // TODO: Need the right syntax for  defmt channels
        // cortex_m::asm::delay(100_000_000); // Approximately 1/4 second intervals, at 400Mhz clock speed
        board_red_led.toggle();
    }
}

fn basic_types_with_err_result() -> Result<(), &'static str> {
    let bool_val: bool = true;
    let bool_ref: &bool = &bool_val;

    let int_val: isize = -1;
    let int_ref: &isize = &int_val;

    let char_val: char = 'a';
    let char_ref: &char = &char_val;

    let i8_val: i8 = 68;
    let i8_ref: &i8 = &i8_val;

    let i16_val: i16 = -16;
    let i16_ref: &i16 = &i16_val;

    let i32_val: i32 = -32;
    let i32_ref: &i32 = &i32_val;

    let i64_val: i64 = -64;
    let i64_ref: &i64 = &i64_val;

    let uint_val: usize = 1;
    let uint_ref: &usize = &uint_val;

    let u8_val: u8 = 100;
    let u8_ref: &u8 = &u8_val;

    let u16_val: u16 = 16;
    let u16_ref: &u16 = &u16_val;

    let u32_val: u32 = 32;
    let u32_ref: &u32 = &u32_val;

    let u64_val: u64 = 64;
    let u64_ref: &u64 = &u64_val;

    let f32_val: f32 = 2.5;
    let f32_ref: &f32 = &f32_val;

    let f64_val: f64 = 3.5;
    let f64_ref: &f64 = &f64_val;

    Err("Forced Error")
}

trait TraitWithAssocType {
    type Type;

    fn get_value(&self) -> Self::Type;
}
impl TraitWithAssocType for i32 {
    type Type = i64;

    fn get_value(&self) -> i64 {
        *self as i64
    }
}

struct Struct<T: TraitWithAssocType> {
    b: T,
    b1: T::Type,
}

enum Enum<T: TraitWithAssocType> {
    Variant1(T, T::Type),
    Variant2(T::Type, T),
}

fn assoc_struct<T: TraitWithAssocType>(arg: Struct<T>) {}

fn assoc_local<T: TraitWithAssocType>(x: T) {
    let inferred = x.get_value();
    let explicitly: T::Type = x.get_value();
}

fn assoc_arg<T: TraitWithAssocType>(arg: T::Type) {}

fn assoc_return_value<T: TraitWithAssocType>(arg: T) -> T::Type {
    return arg.get_value();
}

fn assoc_tuple<T: TraitWithAssocType>(arg: (T, T::Type)) {}

fn assoc_enum<T: TraitWithAssocType>(arg: Enum<T>) {
    match arg {
        Enum::Variant1(a, b) => {}
        Enum::Variant2(a, b) => {}
    }
}
