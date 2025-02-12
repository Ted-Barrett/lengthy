# Lengthy

### What is lengthy?

You've probably heard of URL shorteners - websites like [bit.ly](https://bit.ly), [tinyurl.com](https://tinyurl.com), etc. Lengthy is a URL **lengthener**. If you've ever felt like your URL is a bit too short, you've found the right place!

You can check out Lengthy here:
[cccccccccccccccccccccccccccccccccccccccc.cc](https://cccccccccccccccccccccccccccccccccccccccc.cc/)

### Why?

To be honest I bought the domain first, then tried to think of something fun to do with it. I haven't used rust before, so I tried it out for the first time when building the backend (for that reason, don't expect it to be amazing!)

### How?

Lengthy is mostly pretty simple - fundamentally, it takes a URL, validates it, and then stores it against a key.

In reality, it's a bit more complicated as I wanted to play around with hashing and encryption (I am not a cryptographer - **please don't consider this explanation to be security advice!**).

When you send a URL to lengthy, a few steps occur.

1. A hash of the URL is generated. Let's call this `HashA`.
1. The bits from `HashA` are used to generate a string of capital and lowercase `C`s. This is the "lengthened" url, which is returned to the user.
1. We then use `HashA` as an AES256 key to encrypt the URL. Let's call this `EncryptedURL`.
1. `HashA` is then hashed again to produce `HashB`.
1. `EncryptedURL` is then stored under the key of `HashB`.

Then, to retrieve the URL:

1. You supply the "lengthened" url (effectively, this is `HashA`).
1. `HashB` is produced, which is then used to retrieve `EncryptedURL`
1. `EncryptedURL` is then decrypted, using `HashA` as the AES256 key.

Therefore:

- We never store `HashA`.
- It is impossible to retrieve URLs from the database even with admin access.

There are a few other minor things which happen as well, such as inserting `.` characters in the place of some of the lowercase `c`s, to avoid [this](https://stackoverflow.com/questions/50298340/chrome-changes-url-case) bug in chrome.

### Where?

The lengthy backend is hosted on AWS. It is a simple rust lambda function which is invoked via API Gateway. The data store is DynamoDB.

The backend also serves the frontend, which is bundled into a file which is available to the lambda.

All requests are proxied through CloudFlare. This facilitates easy caching.
