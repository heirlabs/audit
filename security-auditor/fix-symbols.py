#!/usr/bin/env python3
import sys
import os

def shorten_symbol_names(file_path):
    """Replace long symbol names in the ELF file with shorter versions."""
    
    with open(file_path, 'rb') as f:
        data = f.read()
    
    # Find and replace the problematic symbol
    old_pattern = b'.bss._ZN98_$LT$switchboard_solana..program_id..SWITCHBOARD_PROGRAM_ID$u20$as$u20$core..ops..deref..Deref$GT$5deref11__stability4LAZY17ha3b89edb3e526ca9E'
    new_pattern = b'.bss._ZN_short'
    
    # Pad with nulls to maintain the same length
    new_pattern = new_pattern + b'\x00' * (len(old_pattern) - len(new_pattern))
    
    modified_data = data.replace(old_pattern, new_pattern)
    
    # Write the modified data back
    output_path = file_path.replace('.so', '_fixed.so')
    with open(output_path, 'wb') as f:
        f.write(modified_data)
    
    print(f"Fixed file written to: {output_path}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python fix-symbols.py <path_to_so_file>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found")
        sys.exit(1)
    
    fixed_path = shorten_symbol_names(file_path)
    print(f"Successfully shortened symbol names in {fixed_path}")