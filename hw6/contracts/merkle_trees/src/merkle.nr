pub fn compute_merkle_root<let N: u32>(leaf: Field, index: Field, hash_path: [Field; N]) -> Field {
    let n = hash_path.len();
    let index_bits: [u1; N] = index.to_le_bits();
    let mut current = leaf;
    for i in 0..n {
        let path_bit = index_bits[i] != 0;
        let (hash_left, hash_right) = if path_bit {
            (hash_path[i], current)
        } else {
            (current, hash_path[i])
        };
        current = std::hash::pedersen_hash([hash_left, hash_right]);
    }
    current
}