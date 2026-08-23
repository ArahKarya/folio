use crate::error::{AppError, AppResult};

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Base64 without a dependency. Used for two narrow jobs: inlining MOBI images
/// into the document, and receiving a rendered PDF cover from the webview.
pub fn encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(ALPHABET[(n >> 18 & 63) as usize] as char);
        out.push(ALPHABET[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// Accepts a bare payload or a full `data:` URL, since the webview's
/// `canvas.toDataURL()` produces the latter.
pub fn decode(input: &str) -> AppResult<Vec<u8>> {
    let payload = match input.find(";base64,") {
        Some(at) => &input[at + ";base64,".len()..],
        None => input,
    };

    let mut out = Vec::with_capacity(payload.len() / 4 * 3);
    let mut buffer = 0u32;
    let mut bits = 0u32;
    for byte in payload.bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' | b' ' | b'\t' => continue,
            _ => return Err(AppError::msg("Malformed image data.")),
        } as u32;
        buffer = (buffer << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips() {
        for sample in [&b""[..], b"f", b"fo", b"foo", b"foob", b"fooba", b"foobar"] {
            assert_eq!(decode(&encode(sample)).unwrap(), sample);
        }
    }

    #[test]
    fn strips_data_url_prefix() {
        assert_eq!(decode("data:image/png;base64,Zm9v").unwrap(), b"foo");
    }
}
