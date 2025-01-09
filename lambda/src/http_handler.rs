use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoDBClient};
use lambda_http::{Body, Error as LambdaError, Request, RequestExt, Response};
use percent_encoding::percent_decode_str;
use rand::Rng;

pub(crate) async fn function_handler(event: Request) -> Result<Response<Body>, LambdaError> {
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let dynamo_client = DynamoDBClient::new(&config);

    let path = event.raw_http_path();
    let path_components: Vec<&str> = path.trim_start_matches("/").split("/").collect();

    let response = match path_components.as_slice() {
        ["api", "hello", name] => handle_hello(name, &event).await,
        ["api", "generate", some_url] => handle_generate(&dynamo_client, &some_url).await,
        [c_string] => handle_shortened_url(&dynamo_client, &c_string).await,
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

async fn handle_default(path: &str) -> Result<Response<Body>, LambdaError> {
    let message = format!("No handler for path: {path}");

    let resp = Response::builder()
        .status(404)
        .header("content-type", "text/html")
        .body(message.into())
        .map_err(Box::new)?;
    Ok(resp)
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

    let randomised_domain = randomize_case("cccccccccccccccccccccccccccccccccccccccc.cc");

    let message = format!("{randomised_domain}/{c_string}");

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

fn randomize_case(input: &str) -> String {
    let mut rng = rand::thread_rng();
    input
        .chars()
        .map(|c| {
            if rng.gen_bool(0.5) {
                // 50% chance to change case
                c.to_uppercase().to_string()
            } else {
                c.to_lowercase().to_string()
            }
        })
        .collect::<String>()
}
