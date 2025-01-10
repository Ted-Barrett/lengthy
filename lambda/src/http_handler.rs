use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoDBClient};
use base64::{engine::general_purpose::STANDARD, Engine};
use infer::MatcherType;
use lambda_http::{Body, Error as LambdaError, Request, RequestExt, Response};
use percent_encoding::percent_decode_str;
use std::{env, fs, path::Path};

pub(crate) async fn function_handler(event: Request) -> Result<Response<Body>, LambdaError> {
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let dynamo_client = DynamoDBClient::new(&config);

    let path = event.raw_http_path();
    let path_components: Vec<&str> = path.split("/").filter(|&x| !x.is_empty()).collect();

    let response = match path_components.as_slice() {
        [] => handle_home().await,
        ["api", "hello", name] => handle_hello(name, &event).await,
        ["api", "generate", some_url] => handle_generate(&dynamo_client, &some_url).await,
        [c_string] if c_string.len() == 256 && c_string.chars().all(|c| c == 'C' || c == 'c') => {
            handle_shortened_url(&dynamo_client, &c_string).await
        }
        _ => handle_default(path).await,
    };

    response
}

async fn handle_hello(name: &str, event: &Request) -> Result<Response<Body>, LambdaError> {
    let who = event
        .query_string_parameters_ref()
        .and_then(|params| params.first("name"))
        .unwrap_or(name);

    let message = format!("Hello {who}, this is an AWS Lambda HTTP request.",);

    let resp = Response::builder()
        .status(200)
        .header("content-type", "text/html")
        .body(message.into())
        .map_err(Box::new)?;
    Ok(resp)
}

async fn handle_home() -> Result<Response<Body>, LambdaError> {
    let message = format!("Home");

    let resp = Response::builder()
        .status(200)
        .header("content-type", "text/html")
        .body(message.into())
        .map_err(Box::new)?;
    Ok(resp)
}

async fn handle_default(path: &str) -> Result<Response<Body>, LambdaError> {
    let current_dir = env::current_dir().expect("Failed to get current directory");

    let public_dir = current_dir.join("public");

    let relative_path = Path::new(path).strip_prefix("/").unwrap_or(Path::new(path));

    let absolute_path = match public_dir.join(relative_path).canonicalize() {
        Ok(path) => path,
        Err(_) => {
            let resp = Response::builder()
                .status(404)
                .header("content-type", "text/html")
                .body("Not found".into())
                .map_err(Box::new)?;

            return Ok(resp);
        }
    };

    if !absolute_path.starts_with(public_dir) {
        let resp = Response::builder()
            .status(404)
            .header("content-type", "text/html")
            .body("Invalid path".into())
            .map_err(Box::new)?;

        return Ok(resp);
    }

    let contents = fs::read(absolute_path)?;
    let kind = infer::get(&contents).expect("Failed to infer content kind");

    match kind.matcher_type() {
        MatcherType::Image => {
            println!("returning image");
            let resp = Response::builder()
                .status(200)
                .header("Content-Type", kind.mime_type())
                .header("Content-Encoding", "base64")
                .body(Body::from_maybe_encoded(true, &STANDARD.encode(contents)))
                .map_err(Box::new)?;

            return Ok(resp);
        }
        _ => {
            let resp = Response::builder()
                .status(200)
                .header("content-type", kind.mime_type())
                .body(contents.into())
                .map_err(Box::new)?;

            return Ok(resp);
        }
    }
}

async fn handle_generate(
    dynamo_client: &DynamoDBClient,
    target: &str,
) -> Result<Response<Body>, LambdaError> {
    let hash = blake3::hash(target.as_bytes());
    let hash_bytes = hash.as_bytes();

    let request = dynamo_client
        .put_item()
        .table_name("lengthy-prod")
        .item("pk", AttributeValue::B(hash_bytes.to_vec().into()))
        .item(
            "target",
            AttributeValue::S(percent_decode_str(target).decode_utf8().unwrap().into()),
        );
    request.send().await?;

    let c_string = bytes_to_c_string(hash_bytes);

    let domain = [&c_string[30..30 + 40], &c_string[20..20 + 2]].join(".");

    let message = format!("{domain}/{c_string}");

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
    let hash_bytes = c_string_to_bytes(c_string);

    let get_item_result = dynamo_client
        .get_item()
        .table_name("lengthy-prod")
        .key("pk", AttributeValue::B(hash_bytes.to_vec().into()))
        .send()
        .await?;

    if let Some(item) = get_item_result.item {
        if let Some(attribute) = item.get("target") {
            let resp = Response::builder()
                .status(307)
                .header("location", attribute.as_s().unwrap())
                .body("asdf".into())
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
