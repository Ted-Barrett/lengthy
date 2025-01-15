use aes_gcm::{
    aead::{generic_array::GenericArray, Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key,
};
use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoDBClient};
use base64::{engine::general_purpose::STANDARD, Engine};
use infer::MatcherType;
use lambda_http::{Body, Error as LambdaError, Request, RequestExt, Response};
use percent_encoding::percent_decode_str;
use std::{env, fs, path::Path};
use url::Url;

pub(crate) async fn function_handler(event: Request) -> Result<Response<Body>, LambdaError> {
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let dynamo_client = DynamoDBClient::new(&config);

    let path = event.raw_http_path();
    let path_components: Vec<&str> = path.split("/").filter(|&x| !x.is_empty()).collect();

    let response = match path_components.as_slice() {
        [] => handle_file("/index.html").await,
        ["api", "generate", some_url] => handle_generate(&dynamo_client, &some_url).await,
        [c_string]
            if c_string.len() == 256
                && c_string.chars().all(|c| c == 'C' || c == 'c' || c == '.') =>
        {
            handle_shortened_url(&dynamo_client, &c_string).await
        }
        _ => handle_file(path).await,
    };

    response
}

async fn handle_file(path: &str) -> Result<Response<Body>, LambdaError> {
    println!("handle_default");

    let not_found_resp = Response::builder()
        .status(404)
        .header("content-type", "text/html")
        .body("File not found".into())?;

    let current_dir = env::current_dir().expect("Failed to get current directory");

    let public_dir = current_dir.join("public");

    let relative_path = Path::new(path).strip_prefix("/").unwrap_or(Path::new(path));

    let absolute_path = match public_dir.join(relative_path).canonicalize() {
        Ok(path) => path,
        Err(_) => {
            return Ok(not_found_resp);
        }
    };

    // Ensure requested path doesn't escape the public directory
    if !absolute_path.starts_with(public_dir) {
        return Ok(not_found_resp);
    }

    let contents = fs::read(&absolute_path)?;

    let kind = infer::get(&contents);

    match kind {
        Some(x) if x.matcher_type() == MatcherType::Image => {
            // APIG requires that binary files are encoded in base64
            let resp = Response::builder()
                .status(200)
                .header("Content-Type", x.mime_type())
                .header("Content-Encoding", "base64")
                .body(Body::from_maybe_encoded(true, &STANDARD.encode(contents)))?;

            return Ok(resp);
        }
        Some(x) => {
            let resp = Response::builder()
                .status(200)
                .header("content-type", x.mime_type())
                .body(contents.into())?;
            return Ok(resp);
        }
        _ => {
            let file_extension = Path::new(&absolute_path)
                .extension()
                .and_then(|extension| extension.to_str())
                .unwrap_or("plain");

            let text_type = match file_extension {
                "js" => "javascript",
                other => other,
            };

            let resp = Response::builder()
                .status(200)
                .header("content-type", format!("text/{text_type}"))
                .body(contents.into())?;
            return Ok(resp);
        }
    }
}

async fn handle_generate(
    dynamo_client: &DynamoDBClient,
    target: &str,
) -> Result<Response<Body>, LambdaError> {
    println!("handle_generate");

    let invalid_resp = Response::builder()
        .status(400)
        .header("content-type", "text/html")
        .body("Invalid input".into())?;

    let url = match percent_decode_str(target)
        .decode_utf8()
        .and_then(|decoded_str| Ok(Url::parse(&decoded_str)))
    {
        Ok(Ok(result)) if ((result.scheme() == "https") || (result.scheme() == "http")) => result,
        _ => {
            return Ok(invalid_resp);
        }
    };

    let hash = blake3::hash(url.as_str().as_bytes());
    let aes_key_bytes = hash.as_bytes();

    let aes_key = Key::<Aes256Gcm>::from_slice(aes_key_bytes);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let cipher = Aes256Gcm::new(&aes_key);
    let cipher_text = cipher
        .encrypt(&nonce, (url).to_string().as_bytes().as_ref())
        .unwrap();

    // Concat the nonce and the cipher_text so they can be stored together
    let mut result = nonce.to_vec();
    result.extend_from_slice(&cipher_text);

    let key_hash = blake3::hash(aes_key_bytes);

    let request = dynamo_client
        .put_item()
        .table_name("lengthy-prod")
        .item("pk", AttributeValue::B(key_hash.as_bytes().to_vec().into()))
        .item("target", AttributeValue::B(result.into()));
    request.send().await?;

    let c_string = bytes_to_c_string(aes_key_bytes);

    let domain = [&c_string[30..30 + 40], &c_string[20..20 + 2]].join(".");

    let mut dotted_c_vec: Vec<char> = c_string.clone().chars().collect();

    let mut counter: usize = 0;

    for &byte in &hash.as_bytes()[..16] {
        counter += usize::from(byte);
        counter %= 256;
        if dotted_c_vec[counter] == 'c' {
            dotted_c_vec[counter] = '.'
        }
    }

    let dotted_c_string: String = dotted_c_vec.iter().collect();

    let message = format!("{domain}/{dotted_c_string}");

    let resp = Response::builder()
        .status(200)
        .header("content-type", "text/html")
        .body(message.into())
        .map_err(Box::new)?;
    Ok(resp)
}

async fn handle_shortened_url(
    dynamo_client: &DynamoDBClient,
    c_string: &str,
) -> Result<Response<Body>, LambdaError> {
    println!("handle_shortened_url");

    let aes_key_bytes = c_string_to_bytes(c_string);

    let key_hash = blake3::hash(&aes_key_bytes);

    let get_item_result = dynamo_client
        .get_item()
        .table_name("lengthy-prod")
        .key("pk", AttributeValue::B(key_hash.as_bytes().to_vec().into()))
        .send()
        .await?;

    if let Some(item) = get_item_result.item {
        if let Some(attribute) = item.get("target") {
            let result = attribute.as_b().unwrap().clone().into_inner();
            println!("found result");
            let nonce: &GenericArray<u8, _> = GenericArray::from_slice(&result[..12]);
            let cipher_text: Vec<u8> = result.as_slice()[12..].to_vec();

            let key = Key::<Aes256Gcm>::from_slice(&aes_key_bytes);

            let cipher = Aes256Gcm::new(&key);

            let plain_text = cipher.decrypt(&nonce, cipher_text.as_ref()).unwrap();

            let url_string = String::from_utf8(plain_text).unwrap();

            let resp = Response::builder()
                .status(307)
                .header("location", url_string)
                .header("Referrer-Policy", "no-referrer")
                .body("Redirecting".into())
                .map_err(Box::new)?;
            return Ok(resp);
        } else {
            println!("Attribute not found.");
        }
    } else {
        println!("Item not found.");
    }
    let resp = Response::builder()
        .status(404)
        .header("content-type", "text/html")
        .body("Not found".into())
        .map_err(Box::new)?;
    Ok(resp)
}

fn bytes_to_c_string(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| {
            format!("{:08b}", byte)
                .chars()
                .map(|c| if c == '0' { 'c' } else { 'C' }) // Map '0' to 'c' and '1' to 'C'
                .collect::<String>()
        })
        .collect::<String>()
}

fn c_string_to_bytes(c_string: &str) -> Vec<u8> {
    c_string
        .chars()
        .collect::<Vec<char>>()
        .chunks(8) // Process each 8 characters as a byte
        .map(|chunk| {
            chunk.iter().enumerate().fold(0u8, |acc, (i, &c)| {
                acc | ((if c == 'C' { 1 } else { 0 }) << (7 - i)) // Set bit based on 'C' or 'c'
            })
        })
        .collect()
}
