/* emDOCS: Core0.x 
 * Memory layout for microAMP framework for SSTP Core 0
  *  SRAM 1 and 2 used for Core 1 
  *  D3 SRAM4 is 64K and shared SHARED 
  */

/* emTODO: Configure DTCMRAM */
/* emTODO: Configure D2 SRAM3 for Ethernet buffers */

MEMORY
{
  /* FLASH and RAM are mandatory memory regions */
  FLASH   : ORIGIN = 0x08000000, LENGTH = 1M  
  RAM     : ORIGIN = 0x20000000, LENGTH = 128K /*DTCM*/
  SHARED  : ORIGIN = 0x38000000, LENGTH = 64K /*SRAM4*/
  /* AXISRAM */
/*   AXISRAM : ORIGIN = 0x24000000, LENGTH = 512K */
  /* SRAM */
/*   SRAM3   : ORIGIN = 0x30040000, LENGTH = 32K */

  /* Backup SRAM */
/*   BSRAM   : ORIGIN = 0x38800000, LENGTH = 4K */

  /* Instruction TCM */
/*   ITCM    : ORIGIN = 0x00000000, LENGTH = 64K */
}

/* The location of the stack can be overridden using the
   `_stack_start` symbol.  Place the stack at the end of RAM */
_stack_start = ORIGIN(RAM) + LENGTH(RAM);

/* The location of the .text section can be overridden using the
   `_stext` symbol.  By default it will place after .vector_table */
/* _stext = ORIGIN(FLASH) + 0x40c; */

/* These sections are used for some of the examples */
SECTIONS {
/*
  .axisram : ALIGN(8) {
    *(.axisram .axisram.*);
    . = ALIGN(8);
    } > AXISRAM
  /* The SRAM1 and SRAM2 section are commonly used as the stack and heap for the
     CM4 core in dualcore versions and should thus not be used in examples*/
/*  .sram3 (NOLOAD) : ALIGN(4) {
    *(.sram3 .sram3.*);
    . = ALIGN(4);
    } > SRAM3
  .shared : ALIGN(4)
*/

} INSERT AFTER .bss;