General information
This manual provides Beeline network services descriptions as well as step-by-step guidelines on how to configure them properly. We’ve done our best to write down the whole sequence of actions in the most detailed way, but we can’t promise to foresee everything – for this occasion you have our technical support at your disposal to clarify all the necessary details during the configuration.

Network architecture in brief
Our company uses its own content delivery network (CDN) to provide services. Beeline network is divided into two functional areas: the core and content distribution servers. The distribution servers are installed in the regions with the majority of end users. Generally, the content is aggregated within the network and is being delivered to end users via the nearest distribution server. Saying “the nearest” we now mean a server with the best general metrics (it’s not necessary for the server picked up to be the nearest one geographically). Redirector forwards the users` requests to the appropriate distribution servers. Redirector is a part of the network core and is actually a DNS server that runs intelligent software operating together with DNS service. Speaking of live streaming, the stream is pre-delivered to publishing servers which together make up the network core, after what it is being forwarded to distribution servers. The main goal of CDN is to bring content, primarily video one, as close to end users as possible. Main CDN services:

HTTP Acceleration. HTTP-content is cached on distribution servers as necessary and is delivered from the appropriate server by the user’s request.
Live Streaming. It enables broadcasting of the live video streams to large audiences in real time. The stream may be broadcast either from a content provider`s origin server or directly from an IP camera. Another way of using live streaming is broadcasting TV channels over the Internet (which is now realized by nearly all TV-channels).
Video on Demand Streaming. It offers an opportunity of watching videos at any time. It’s also possible to start playing a video at any moment, without a necessity of loading the whole file.
Additional CDN services
Content access authorization.
Access to the network programming interface (API).
Stream transcoding.
Over-the Air browsing (DVR).
Stream recording.

HTTP Caching
HTTP caching significantly speeds up the loading of static objects, such as:

Images
Video and audio files
CSS and JavaScript files
Documents and other files
Benefits of using HTTP caching:

Reduced website response time
Improved access reliability
Fast loading even for "heavy" pages
Users will be able to quickly load content from any source without delays or interruptions, which will enhance their experience when interacting with your resource.

Setting Up HTTP Caching
Attention!

Please note that there is a system-wide limit of 100 resources per account. If you require additional resources, please reach out to your account manager or contact our support team.

To get started with HTTP caching, follow these steps:

Navigate to the "CDN" section in the left sidebar
Select the "HTTP Caching" tab
Click the "Add Resource" button located in the top right corner
After completing these steps, you'll be prompted to select your preferred Content Delivery Optimization method.



Content Delivery Optimization
When creating a resource, you need to choose one of the following content delivery optimization options:

Static Content

Optimizes delivery of images, video files, JavaScript files, CSS files, etc.

Text files are compressed (gzip by default) before being served to users.

Large Files

Optimizes delivery of large files (larger than 20 MB)

Files from the origin are loaded in parts (HTTP Range requests)

No compression is performed on the CDN side

You can specify the size of the range request slice as an integer from 1 to 1024 MB

Default slice value: 16 MB

Note

After changing the slice size when editing a resource, we recommend clearing the resource cache.

Important

Different optimization types have their own limitations:

Static Content - in the rules, you can enable only one option from the following list: (image optimization, video conversion, Brotli compression).
Large Files - you cannot enable image optimization, video conversion, or Brotli compression options in the resource or its rules.
Data Source
After selecting the content delivery optimization type, you need to specify the correct data source.



The data source can be:


A domain, for example: www.example.com
An IP address, for example: 86.86.87.88
Example: yourdomain.com:443

When using an S3 domain as a data source, you need to additionally specify the allowed bucket in the corresponding field.

Note: If you have multiple content sources (primary/backup), you'll be able to configure a source pool in the next setup step.

Click the "Create" button to initiate the caching resource creation process. The system will then begin applying the resource settings across the CDN network.

Important

Applying resource settings across our network may take up to 15 minutes.

The resource is ready for use when its status changes to "Active".

How to Use
On the right side of the interface, you'll find an "How to Use" block containing important information:

Your Domain: A unique URL for accessing your content through the CDN.

Link Replacement: Guidelines for correctly replacing resource links to use the CDN.

File Path Example: Demonstration of the proper link format.

CMS Integration: Information about plugins for popular CMS platforms.

Configuring HTTP Resource
You can make necessary changes to the resource settings immediately after creating it.

Important

Keep in mind that each configuration change takes up to 15 minutes to apply across the CDN network. During this time, the resource continues to operate with the previous configuration until the update is complete.

Recommendations:

Carefully review all settings before applying changes
Plan your changes in advance, considering the application time
If you're making multiple changes, consider implementing them all at once to minimize overall update time
Resource Configuration


Data Source

If you have multiple content sources (primary/backup), you can add them to a Domain Group and configure the priority for each. If the "highest priority" source becomes unavailable, the CDN network will automatically switch to the next source. It will automatically switch back to the priority source once it's functioning normally again.

You can configure Weight and Max fails for each source.

Weight is a numerical value that determines what proportion of requests a specific server should receive. The higher the weight, the more requests will be directed to that server. The default weight is 1.

Max_fails - this parameter defines the number of failed connection attempts to a server, after which Nginx will consider it unavailable for a certain period. The default max_fails value is 10.

Use HTTPS for Source Requests
By default, requests to sources are made using HTTPS. Here you can disable the use of HTTPS if needed.

You can also enable source certificate verification by selecting the corresponding option.



Please note

The "Verify source certificate" option is only available when "Use HTTPS for source requests" is enabled.

Specifying an SNI Host

The additional option to specify an SNI host (Server Name Indication) allows you to manually define the hostname sent during the TLS handshake with the origin server. This functionality is particularly useful in the following cases:

When using virtual hosting, where a single IP address serves multiple domains
When non-standard configurations are required for specific hosts
To ensure proper handling of SSL/TLS certificates in multiple-domain configurations. For example, if your origin server hosts both 'example.com' and 'example.net' on the same IP address, specifying the SNI host ensures that the correct SSL/TLS certificate is presented during the handshake.
Hostname for Source Requests
If you're using hosting services such as Wix, Amazon S3, Selectel, etc., please pay special attention to the Hostname section.



Many virtual hosting services (such as Amazon S3) host multiple websites on a single web server. For CDN nodes to access your content correctly, you need to specify the correct Hostname.

Follow these steps if you're unsure about your Hostname:

Visit your website and right-click on any image to copy its link.
Paste this link into a new browser window. The resulting domain is your site's Content Source. For example, if your site is hosted on Wix, the content source domain will be static.wixstatic.com
Go to https://check-host.net and enter your website's domain (not the content source domain).
On the "Information" tab, look for the "Resource Name" - this is your Hostname. For instance, if you're using Amazon hosting, your Hostname might look like: ec7-54-151-126-156.eu-west-1.compute.amazonaws.com
Enter this Hostname in your account dashboard
AWS Authorization
You can use AWS authorization when requesting from sources. To do this, select the corresponding option and enter two keys: the access key and the secret key.



Caching
Here you can specify caching times based on response codes (2xx, 3xx, 4xx, 5xx) and set the option to ignore caching control headers ("Expires" and "Cache-Control").



Initially, each user has basic time settings, but these can be customized.

Important

The cache duration settings are specified in seconds

Ignore caching control headers

If the content source (origin) responses already contain Cache-Control and/or Expires headers, caching is performed for the time specified in these headers. To change this behavior, enable Ignore caching control headers. In this case, caching will be performed for the time specified in this section. The specified caching time will also be used for content source (origin) responses that do not contain caching control headers.

Please note

Invalid header values (Expires with a past time, or Cache-control: private) disable caching, which often leads to increased load on the content source (origin).

Using Stale Content in CDN



The Use Stale option allows the CDN to serve previously cached versions of content when fetching up-to-date data from the origin server is not possible. This functionality ensures continuous content availability and helps minimize service disruptions for users.

When the "Serve Stale Content on Origin Unavailability" option is enabled, the system will return cached content in the following cases:

error - an error occurred while establishing a connection with the server, passing a request to it, or reading the response header.
timeout - a timeout has occurred while establishing a connection with the server, passing a request to it, or reading the response header.
invalid_header - a server returned an empty or invalid response.
updating - permits using a stale cached response if it is currently being updated.
http_500 - a server returned a response with the code 500.
http_502 - a server returned a response with the code 502.
http_503 - a server returned a response with the code 503.
http_504 - a server returned a response with the code 504.
In these scenarios, the user will receive the most recent cached version of the requested resource instead of an error message. This provides a better user experience during temporary issues with the origin server.

Stale conditions

Here you can set a list of conditions to give outdated cached content if the origin is unavailable (the enabled Use Stale setting is required).

List of available options:

error - an error occurred while establishing a connection with the server, passing a request to it, or reading the response header.
timeout - a timeout has occurred while establishing a connection with the server, passing a request to it, or reading the response header.
invalid_header - a server returned an empty or invalid response.
updating - permits using a stale cached response if it is currently being updated.
http_500 - a server returned a response with the code 500.
http_502 - a server returned a response with the code 502.
http_503 - a server returned a response with the code 503.
http_504 - a server returned a response with the code 504.
http_403 - a server returned a response with the code 403.
http_404 - a server returned a response with the code 404.
http_429 - a server returned a response with the code 429.
Cache considering query string



When this option is enabled, query string parameters will be taken into account when caching content.

Query string whitelist

The Query String Whitelist defines a list of allowed query parameters (request arguments), which are taken into account when caching. Any query parameters not included in this list are ignored during request processing.

Warning

By default, the Query String Whitelist is empty, meaning that all query string parameters in the request are included in cache key generation and processing.

Query string blacklist

The Query String Blacklist defines a list of disabled query parameters (request arguments), which are taken into account when caching. Any query parameters included in this list are ignored during request processing.

Warning

By default, the Query String Blacklist is empty, meaning that all query string parameters in the request are included in cache key generation and processing.

If you want to redefine whitelist/blacklist, then you need to disable the option "Consider all query string parameters" and set parameter lists.



Warning

You can set only one of the 2 properties: either whitelist or blacklist.

Cache Based on Cookies



When the "Cache Based on Cookies" option is enabled, the system will take cookie parameters into account when caching content. This allows for the creation of separate cache versions for different cookie values.

Cookies Whitelist

The Cookies Whitelist allows you to specify a list of cookies that should be considered during caching and other cookie-related operations. All other cookies not included in this list are ignored by the system.

Warning

By default, the Cookies Whitelist is empty, meaning that all cookie parameters are included in cache key generation and request processing

Cookies Blacklist

The Cookies Blacklist allows you to specify a list of cookies that should be not considered during caching and other cookie-related operations. All other cookies included in this list are ignored by the system.

Warning

By default, the Cookies Blacklist is empty, meaning that all cookie parameters are included in cache key generation and request processing

If you want to redefine whitelist/blacklist, then you need to disable the option "Consider all parameters" and set parameter lists.



Warning

You can set only one of the 2 properties, either whitelist or blacklist.

This approach helps:

Avoid cache redundancy
Retain only the necessary data for personalization
Optimize storage of dynamic content
CNAME
A CNAME record allows you to assign an alias to a host. This alias typically associates a specific function with the host or simply shortens its name.

By default, your content is accessible at: example.a.trbcdn.net/images/1.jpg

With CNAME, you can set up access at: cdn.example.com/images/1.jpg

Creating a CNAME record:

Open the DNS management page on your DNS hosting site
Create a new CNAME record with the following parameters:
Name (Host): "cdn" Note: Some control panels may require you to specify the full subdomain name, e.g., cdn.example.com
Value: example.a.trbcdn.net. (note the period at the end)
Waiting for changes to apply:

DNS changes may take up to 72 hours to take effect
Verifying the setup:

After the waiting period, check if your content is accessible at the new address
Use DNS checking tools to confirm the correct setup
HTTPS Delivery via CNAME (SSL Certificate)
By default, after saving the settings, your content will be accessible via HTTPS The standard URL will look like: https://example.a.trbcdn.net

If you plan to use an SSL certificate, you have two main options:

a) Upload your own certificate:

Prepare your SSL certificate in advance
Upload it before or after creating the resource
Select the uploaded certificate from the list of available ones when configuring the resource
b) Issue a Let's Encrypt certificate:

Choose the option to issue a Let's Encrypt certificate in the resource settings
The system will automatically generate and configure the certificate for your resource
Image Optimization $


This feature allows you to optimize image delivery and modify images on the fly.

Important

The service has a file size limit of 2 MB. Files larger than 2 MB will not be processed and will be delivered unchanged. If you need to process files larger than 2 MB, please contact your account manager or support team.

Image Delivery Optimization $
This service allows for on-the-fly conversion of images from JPEG, GIF, PNG (.jpg, .jpeg, .png, .gif) formats to WebP (.webp) format.
WebP is a format that uses an advanced compression algorithm, allowing for size reduction in some images without visible quality loss (by 25-35%). The WebP format is supported by most modern browsers.

The platform analyzes the Accept HTTP header from the user's request and determines whether the user's browser supports the WebP format:

If supported, the user receives the image in WebP format;
If not supported, the image is delivered in its original format.
Conversion to WebP format occurs automatically in asynchronous mode. This means:

You don't need to change your web resource's code and/or the format of image links in advance.
The first request from an end-user whose browser supports WebP triggers the image conversion to WebP format. In response to this first request, the image may be delivered in its original format (to avoid conversion delays). After the conversion is complete, all subsequent requests for this image will receive the WebP version (if the end-user's browser supports it).
Image Modification $
This feature allows for on-the-fly image modifications at the time of request. Supported file extensions are jpeg, jpg, gif, png, and webp.

Modifications are applied through special URIs in the format /ioss(<modification parameter>=<value>)/

Available modifications:

Modification	Modification Parameter	Possible Values
Quality Adjustment	quality	1-100
integer
Size Adjustment	resize=<width>x<height>,
resize=<width>,
resize=x<height>	1-4000
integer (pixels)
for <width>, <height>
Progressive JPEG	progressive	y/n
Quality Adjustment (quality)
Parameter: quality
Values: 1-100 (integer)
Request Examples:

https://example.a.trbcdn.net/ioss(quality=70)/example.jpg 

https://example.a.trbcdn.net/ioss(quality=1)/example.jpg 

Size Adjustment (resize)
Parameter: resize
Format: <width>x<height>, <width>, or x<height>
Values: 1-4000 (integer, in pixels)
Lossless resizing is only possible when reducing the image size.

Request Examples:

https://example.a.trbcdn.net/ioss(resize=400x300)/example.jpg 

https://example.a.trbcdn.net/ioss(resize=x200)/example.jpg 

Progressive JPEG (progressive)
Allows the image to be rendered initially at minimum quality, then improved as it loads.

Parameter: progressive
Values: y/n
Request Example:

https://example.a.trbcdn.net/ioss(progressive=y)/example.jpg

Applying Optimization and Modification
Enable the "Image Optimization" option in the CDN resource settings
Use special URIs to apply desired modifications to images
Test various parameters to achieve an optimal balance between image quality and size
Video Conversion


This service allows you to convert MP4 files for delivery via HLS or MPEG-DASH streaming protocols.

The service can be enabled for the entire resource, or for a specific path (rule).

Important

We do not support the Fragmented MP4 container for this service. You can check the file container using the command MP4Box -info test.mp4

Instructions for viewing MP4 files using streaming protocols can be found in the Guide on the resource editing page.



Content Access Restrictions $


In this section, you can set content distribution restrictions based on:

Country and region
IP address
Referer
User-Agent
Authorization restrictions
Module Configuration Process
Activate the type of restriction you need and choose the default rule (deny or allow).
Add exceptions to the default rule. For geo-restrictions, also select a rule for the exception itself. This way, you can, for example, deny traffic for an entire country while allowing it for a specific region.
If necessary, set time intervals for the rule's validity. Intervals should not overlap.
It's possible to add several different rules of each type, provided their time intervals do not overlap.
Authorization by Code Word


Description:

Authorization of user requests is performed exclusively in the CDN network, external resources are not used. The decision to access a resource is made by means of our network based on the criteria specified by the content owner:

Secret key. It is checked that the link was generated by the content owner.
The URI of the requested resource. It is checked that the link was generated specifically for this file.
User's IP address (optional). It is checked that the resource was requested from exactly the IP address for which the link was generated. You can disable the check by selecting the "Do not impose IP address filter" option.
The expiration time of the link (optional). You can turn off the check by selecting the "Do not impose time restrictions" option.
At the moment the user accesses a protected resource, the content owner needs to generate a special link.

Example:

http://example.a.trbcdn.net/md5(kymJ2w55VH4LUMSKGb6ZqA,1704067200)/path/to/file

The link contains authorization parameter md5(<md5 hash>[,<expires>]):

<md5 hash> - MD5 hash in Base64 format for URL, generated based on secret key, URI of the requested resource, user's IP address (optional) and link lifetime (optional);
<expires> is the expiration time of the link in POSIX time format (optional).
When accessing content using the generated link, the CDN calculates the MD5 value and compares it with the received one. If the MD5 value does not match, then a 403 Forbidden response is returned to the user (access is denied).

If the current time exceeds the value <expires>, then a response with the code 410 Gone (the target resource is no longer available) is returned to the user.

Algorithm for generating an MD5 hash (<md5_hash>) for signing links:

Form the signature string <secret_word><path_to_file><ip><expire_time>. The <ip> and/or <expire_time> elements are not added to the signature string if Do not impose IP address filter and/or Do not impose time restrictions is specified in the local authorization settings.
Generate base64_url via base64_url(md5(<signature string>)).
Generate the <md5 hash> signature by performing the following substitutions in base64_url:
replace the = character with the empty string ''.
replace the + character with -
replace the / character with _
Form the link using the obtained signature <md5 hash>.
Attention

The domain part of the URI is not used when calculating the hash!
You can sign part of the path (for example, for /path/to/file, you can sign the file itself, /path/to, /path)
When generating MD5, the URL should not contain urlencoded characters, but should contain the original characters: cyrillic, spaces, percentages, etc. Then you should request the urlencoded version of the URL with this hash.
The MD5 hash calculated for HTTP is the baseline for this resource. The same hash will be used for links to a file over the HTTP, HTTPS protocols, despite the fact that the URI for different protocols may differ slightly.
Example of link generation:

There are the following input data:

Secret key: zah5Mey9Quu8Ea1k
User IP address: 1.2.3.4
File URI: http://example.a.trbcdn.net/path/to/file
Expiration time of the link: 1704067200
Form the signature string <secret_word><path_to_file><ip><expire_time>. Let's assume that we include both IP address and link expiration time.

Then the signature string looks like this: zah5Mey9Quu8Ea1k/path/to/file1.2.3.41704067200

Generate <md5 hash>:

PHP example:


$ php -r 'print str_replace("=", "",strtr(base64_encode(md5("zah5Mey9Quu8Ea1k/path/to/file1.2.3.41704067200", TRUE)), "+/", "-_")) . "\n";'
kymJ2w55VH4LUMSKGb6ZqA

#!/usr/bin/python3
import base64
import hashlib

secret_word = 'zah5Mey9Quu8Ea1k'
path = '/path/to/file'
ip_address = '1.2.3.4'
expiration_timestamp = 1704067200

def generate_local_signature(secret_word, path, ip_address=None, timestamp=None):
    string_to_sign = f'{secret_word}{path}'
    if ip_address is not None:
        string_to_sign = f'{string_to_sign}{ip_address}'
    if timestamp is not None:
        string_to_sign = f'{string_to_sign}{timestamp}'

    hashed_string = hashlib.md5(string_to_sign.encode()).digest()
    decoded_base64_string = base64.b64encode(hashed_string).decode()
    local_signature = decoded_base64_string.replace('+', '-').replace('/', '_').replace('=', '')
    return local_signature

print(generate_local_signature(secret_word, path, ip_address, expiration_timestamp))
# kymJ2w55VH4LUMSKGb6ZqA
Python example:

Result link:

http://example.a.trbcdn.net/md5(kymJ2w55VH4LUMSKGb6ZqA,1704067200)/path/to/file

Authorization by External Script
External authorization is intended to be able to restrict access to a resource with arbitrary logic described in your authorization script.

The decision on access to content is made based on the response of your script, the link to which you indicate in your personal account when creating/editing a resource.



If the authorization of the script came the reply with a status 200, access to the content is permitted. Otherwise, access is denied.

The authorization script is passed the following headers:

Host: contains the domain name for which the request is intended;
X-Request-URI: contains the URI of the requested resource;
X-Forwarded-For: contains the real IP address of the user who is requesting the resource;
X-Remote-Addr: contains the IP address of the user who is requesting the resource, or of the proxy server.
Additional content distribution areas $
This option allows you to configure content delivery parameters beyond the main service area.



Connection
Switch the toggle to Turned on
Select one or more zones:
EMEA (Europe, Middle East, and Africa)
APAC (Asia-Pacific)
AM (Americas)
Click the Apply button
Wait for some time while the settings are applied to the network
HTTPS Configuration
Enable HTTPS distribution in the additional zones settings
Select a certificate from the list of existing ones or upload a new one
Important!

When updating the SSL certificate in the main resource, the certificate in additional distribution zones is not automatically updated. You need to manually update the certificate in the additional zones settings.

When receiving a new certificate:

Update the certificate in the main resource settings
Update the certificate in the additional distribution zones settings
Expert settings
Attention!

This section is intended for advanced users and allows for fine-tuning of the CDN resource.

Use HTTP2
HTTP/2.0 protocol is supported by default. Disable this option if support for this protocol is not required.

Use HTTP3
By default, the HTTP/2.0 protocol is supported. Enable this option if HTTP3 support is required.

Use HTTPS Only
If you want to use only the HTTPS protocol, activate this option.

Please note

If you enable content access only via HTTPS, all requests via HTTP will receive a "403 Forbidden" response (access denied).

Automatically Redirect HTTP to HTTPS
By default, your content will be accessible from Beeline nodes via both HTTP and HTTPS protocols. However, you can set up automatic redirection using this option.

Please note

If you set up HTTP to HTTPS redirection, requests via HTTP will receive a "301 Redirected" response.

Use Only Modern TLS Versions
By default, all versions of the TLS protocol are used, but you can enable the use of exclusively new versions of the TLS protocol (v1.2, v1.3).



Use Strong SSL Ciphers
You can enable the use of strong SSL ciphers.

This configuration:

Keeps TLS 1.2 and 1.3 enabled
Completely disables the outdated TLS 1.1
Enhances connection security
Complies with modern cryptographic protection standards
Recommended for production environments with high security requirements.

Please note

This is only available with the "Use Only Modern TLS Versions" option.

Follow Redirects
By default, only responses with 301, 302, 303, 307 and 308 codes are cached when received from your origin. Activate this option to allow following redirect addresses and caching the content.

Search Engine Indexing
Attention!

By default, we exclude CDN links from indexing to prevent search engine bots from seeing a "mirror" of your site. If a bot catches a "mirror" of your site, it may lead to the site being excluded from indexing. Only experienced users are recommended to work with this section.

Using this setting, you can fine-tune the indexing of your content by search engine bots. You can configure proxying of your robots.txt file or upload it from your device to our portal. Before proxying or uploading your robots.txt, we recommend first verifying its correctness on a special resource.



Headers
In this section, you can specify special headers that need to be added when accessing the data source (To source), or when delivering content to end users (For client).



Hide-in-response option

The Hide-in-response option is used to remove specific HTTP headers from the response sent to the client, which can help improve security or reduce unnecessary information exposure.

Timeouts
In this section, you can specify acceptable timeouts for CDN nodes when accessing your origin. If the actual values start to exceed the acceptable ones, a switch to another content source specified in the Data Source section will occur.



Support SSL-protocols
The "Supported SSL Protocols" option allows you to select which protocols should be supported for your CDN resources.



The following protocols are supported:

TLSv1.1
TLSv1.3
SSLv3
TLSv1
TLSv1.2
Support HTTP methods
This parameter sets the list of allowed HTTP methods for CDN content. The GET, HEAD, and OPTIONS methods are always allowed, and they cannot be disabled.



The following HTTP methods are supported:

POST
PUT
DELETE
PATCH
PROPFIND
MOVE
COPY
LOCK
UNLOCK
PROPPATCH
MKCOL
CORS Check on CDN Side
Description
In some cases, a browser may treat a request to access to certain content hosted on a CDN network as a cross-domain request and block it. It is primarily related to fonts. The issue is addressed by setting CORS (Cross-Origin Resource Sharing) headers for cached objects.

There are two options:

You can set CORS headers on the origin server and disable their verification in our network yourself.
You can set up CORS verification in the Your Account section in our network.
Setup in Dashboard
The CORS verification procedure provided for configuration is based on our proprietary module operation. Its functionality is based on W3C recommendations.

Module Operation Fundamentals:

Where CORS is enabled, Access-Control-* headers from the origin are always ignored and excluded from the response.

Any request without Origin header is not a cross-resource request, and Access-Control-* headers are not transmitted to the client.

Our module never adds Access-Control-Request-* headers, since they are incoming request headers generated by the browser, same as Origin.

Where there is an Origin header, its contents will be matched against that set by the user. In the absence of restrictions, the Access-Control-Allow-Origin response header will include "*", while where there are any restrictions and where Origin is on the allowed list, then ACAO will include http(s?)://${http_origin}; otherwise, the response will include Access-Control-* headers.

Access-Control-Expose-Headers headers are added, if such headers are set by the user. By default, we state a permission to access Content-Range for the operation of range-requests (for JS-based players).

Access-Control-Allow-Credentials (ACAC) headers are included in accordance to that set by the user.

Access-Control-Allow-Methods, Access-Control-Allow-Headers, and Access-Control-Max-Age headers are included only in a response to a request based on the OPTIONS method, which is processed locally and not forwarded to the origin.

Access-Control-Allow-Methods header is set to be equal to the contents of the Access-Control-Request-Method header, if such header is present and is on the list of simple requests (GET, HEAD, POST), or a list set by the user. Where the method is not on the allowed list, then the response will not include Access-Control-* headers. If a request does not contain Access-Control-Request-Method, no Access-Control-Allow-Methods will be set.

Access-Control-Allow-Headers is set to be equal to the contents of the Access-Control-Request-Headers header, if such header is present, Access-Control-Request-Method request header is present, and all headers are on the list of simple headers (Accept, Accept-Language, Content-Type, Content-Language) or on the user-set list. Where at least one header is not on the allowed list, then the response will not contain Access-Control-* headers. Where a request does not contain Access-Control-Request-Method and Access-Control-Request-Headers, Access-Control-Allow-Headers will not be stated.

Access-Control-Max-Age header will be stated in accordance with that set by the user, but not by default.

Any additional response header, specified by the client, will be added/overridden after CORS module processing, while, for example, Access-Control-Allow-Origin: * in header sections will be added irrespective of the CORS module operation results.

Module Configuration Process
CORS verification is active by default. If CORS authorization is disabled, all preflight requests will be forwarded to your origin. The headers, described above and set on the origin, will not be affected and will be transmitted unchanged to end users.

You may adjust the module operation by setting the following parameters:

Allowed Domains (not verified by default, all domains are allowed)

Values may set by either of the following methods:

example.com – exact match
*.example.com - all subdomains example.com exclusive of example.com
.example.com – all Level 3 domains inclusive of example.com
~a\d+\.example.com – regular expression
Secure Request Headers

Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma are allowed by default. You may add your headers to this list.

Upper Level API Accessible Headers (Expose Headers)

Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma are allowed by default. You may add your headers to this list.

Safe Methods

GET, HEAD, POST are allowed by default. You may add your methods to this list.

Access-Control-Allow-Credentials Header

Cookies, sessions, authorizations are incompatible with caching services due to their operating logic. However, if you need to set an Access-Control-Allow-Credentials header, you can do it.

Preflight Request Response Lifetime

A period of time during which a response to a Preflight request is deemed to be relevant.

Attention!

Irrespective of whether CORS authorization is enabled/disabled and its operation results, you may manually redefine any header for responses to end users. To this end, specify its name and desired value in "Headers" section. Authorization header value will be substituted with that specified by you after the CORS verification stage completion.

Return HTTP Status Code
The Return HTTP Status Code option allows you to define how the CDN responds to client requests.

You can specify the HTTP status code and define either the response body or a redirect, depending on your needs.



Rewrite
The Rewrite function modifies the request URL or path at the CDN level, ensuring that the origin server receives the updated request without requiring changes to the server configuration.



How It Works - The client sends a request to the CDN at a specific address. - The CDN applies the Rewrite rule to modify the path or parameters. - The modified request is forwarded to the origin server.

Use Cases:

Path Rewriting

Original request: https://cdn.example.com/images/photo.jpg
Actual path on the server: https://origin.example.com/static/assets/photo.jpg
The CDN will rewrite /images/photo.jpg to /static/assets/photo.jpg.
Adding Parameters

Client request: https://cdn.example.com/api?query=data
Transformed request: https://origin.example.com/internal-api?query=data&token=abc123
Advantages

Hiding the actual server path structure
Flexible routing management
Adding service parameters
Unified access to resources
Brotli Compression $
This option allows you to enable Brotli compression.

Brotli is an open-source, lossless data compression algorithm proposed by Google in 2015. It uses a dictionary with frequently occurring string sequences in text files (e.g., .css, .js), which allows it to achieve on average 20% higher compression rates compared to gzip. It can be enabled for the entire resource or for specific paths through rules in the account interface. It only works over HTTPS.

Compression is possible for the following file types:

application/javascript
application/json
application/vnd.apple.mpegurl
application/vnd.ms-fontobject
application/x-font-opentype
application/x-font-truetype
application/x-font-ttf
application/x-javascript
application/xml
application/xml+rss
font/eot - font/opentype
font/otf - image/svg+xml
image/vnd.microsoft.icon
image/x-icon
text/compressible
text/css
text/html
text/javascript
text/xml
For compression to work correctly, the browser must send the header Accept-Encoding: br (supported in browsers based on Chrome 49+, Firefox 44+, Opera 36+).

Rules
This section is designed for more fine-tuned configuration of the CDN network. Individual rules for any section/path allow you to manage headers, caching, CORS, authorization, and other parameters.

Creating a Rule
To create a rule, specify the path to the directory or to a specific file to which this rule should be applied.



Please note

When configuring rules, it is important to remember that the characters ~ or ~* must be specified to use regular expressions in the path.

~ is used to define case-sensitive matching
~* is used to define case-insensitive matching
Configure rule


The configuration of the rule is configured similarly to configuration of the entire resource.

Except that you don't have to configure the source when configuring it, because by default it is inherited from the main resource.

Attention


If you want to redefine the source, you need to toggle the value in the upper configuration block.

Timeouts

Timeouts for a specific path (rule) are configured similarly to the option for the entire resource.

Use HTTPS

Use HTTPS for source requests for a specific path (rule) are configured similarly to the option for the entire resource.

Headers
Headers for a specific path (rule) are configured similarly to the option for the entire resource.

Caching
Caching for a specific path (rule) is configured similarly to the option for the entire resource.

Image Optimization
Image optimization for a specific path (rule) is configured similarly to the option for the entire resource.

Video Conversion
Video conversion for a specific path (rule) is configured similarly to the option for the entire resource.

Content Access Restrictions $
Restrictions for a specific path (rule) are configured similarly to the restrictions for the entire resource.

Brotli Compression $
Brotli compression for a specific path (rule) is configured similarly to the option for the entire resource.

CORS Check on CDN Side
CORS check on CDN side for a specific path (rule) is configured similarly to the option for the entire resource.

Return HTTP Status Code
Return HTTP Status code on CDN for a specific path (rule) is configured similarly to the option for the entire resource.

Rewrite
Rewrite on CDN for a specific path (rule) is configured similarly to the option for the entire resource.

 Back to top

DNS
Service Overview
Our DNS management platform allows you to configure and manage domain zones and resource records via an intuitive dashboard or API.

Key Features:

Create & manage DNS zones for your domains
Add, edit, or delete resource records (A, AAAA, CNAME, MX, TXT, etc.)
Delegate domains to our nameservers
DNS requests stat with detailed analytics per zone and record type
Built on a globally distributed infrastructure, our service ensures high availability and fast propagation of DNS changes.

Core DNS Concepts
DNS Zone — a domain space where you manage records (e.g., example.com)

SOA (Start of Authority) — the primary DNS record containing critical zone metadata (e.g., admin email, refresh intervals)

Nameservers (NS) — servers that handle DNS queries for your domain. Default nameservers: ns1-c.trbcdn.net., ns2-c.trbcdn.net., ns3-c.trbcdn.net..

FQDN (Fully Qualified Domain Name) — a complete domain name, including hostname, domain, and optional root dot (e.g., www.example.com.)

Record Set — a group of records of the same type for a domain (e.g., multiple A records for sub.example.com)

TTL (Time To Live) — how long (in seconds) DNS resolvers cache records before refreshing.


* Low TTL (e.g., 300s) → Faster updates, more queries
* High TTL (e.g., 86400s) → Better caching, slower updates
Setting Up a DNS Zone
Step 1: Add a Zone
Go to DNS Management in your dashboard
Click "Add DNS-zone"
Enter your domain (e.g., example.com)
Click "Create"
Step 2: Configure Nameservers
After creation, assign these nameservers at your registrar:


ns1-c.trbcdn.net.
ns2-c.trbcdn.net.
ns3-c.trbcdn.net.
Attention

Propagation may take up to 24 hours.

Managing DNS Records
Adding a Record
Select your zone
Click "Add a set of recordings"
Configure:

Type (A, AAAA, CNAME, MX, TXT, etc.)
Name (e.g., www for www.example.com)
Value (IP, domain, or text)
TTL (default: 3600s)
Common Record Types

Type	Purpose	Example
A	IPv4 address	192.0.2.1
AAAA	IPv6 address	2001:db8::1
CNAME	Domain alias	shop.example.com
MX	Mail server	10 mail.example.com
TXT	Verification/SPF/DKIM	v=spf1 include:_spf.example.com ~all
Click "Create"

Best Practices & Troubleshooting
Verifying DNS Changes:

nslookup -type=A shop.example.com
nslookup -type=MX example.com
dig example.com SOA
Propagation Times:
First setup: Up to 24 hours
Updates: Follows TTL (default: 1 hour)
Clearing DNS Cache
Windows: ipconfig /flushdns
macOS/Linux: sudo dscacheutil -flushcache
SOA Record Settings
Parameter	Purpose	Recommended Value
Refresh	How often secondary nameservers check for updates	10800s (3h)
Retry	Retry interval if update fails	3600s (1h)
Expire	Time until zone becomes invalid	604800s (1 week)
Minimum	Negative cache TTL	3600s (1h)
Tip

Lower TTL before major changes to speed up updates.

Need Help?
If DNS records aren’t working:

Wait up to 24 hours for propagation.
Double-check record values.
Contact support if issues persist.
For advanced users:

Use dig or nslookup for debugging.
Monitor changes with DNS propagation tools (e.g., DNS Checker)
 Back to top


Streaming
Service overview
The service enables online broadcasting through the internet without the need to purchase and configure your own servers. Broadcasts are distributed through a CDN network, ensuring content delivery to viewers from the nearest server.

Key features:

HTML5 player: A ready-to-use solution for viewing broadcasts that easily integrates with any website and works on all modern devices
Adaptive streaming: Automatic broadcast quality adaptation based on connection speed and viewer device capabilities
Popular protocol support: Works with RTMP, RTSP, and SRT for maximum compatibility with various equipment
Recording and DVR: Ability to save broadcasts and organize time-shifted viewing
Security: Flexible content access settings
Creating a Broadcast
Go to the Streaming section in your personal account
Click "Create live streaming" in the top right corner
Choose the stream delivery method:
Pull - we pull your stream via RTMP, RTSP, SRT, and HLS over HTTP/HTTPS.
Publish - you send the stream to our servers (RTMP/RTSP or SRT)


When choosing the publishing method, consider your equipment capabilities and broadcast requirements. RTMP/RTSP is suitable for most cases, SRT provides more reliable transmission with unstable connections, and HLS Pull is convenient if the stream already exists in the required format.

Attention!

System limits:

Maximum 100 broadcasts per account
Up to 10 streams for RTMP/RTSP/SRT publishing within one broadcast
Contact support to increase these limits.

Preparing for Broadcast
For the "Publish" delivery method, you'll need special software - an encoder that supports RTMP, RTSP or SRT protocols. We recommend selecting and configuring a suitable encoder in advance. Detailed instructions for configuring popular encoders are available in the corresponding documentation section here.

Please note

When using the RTSP streaming protocol, it's recommended to disable B-frames in the video encoding settings. This will help avoid possible artifacts in the final video stream.

Broadcast Configuration
RTMP/RTSP-publish
Connection Setup


The "Instructions" section contains all necessary data for starting a stream:

Stream latency selection
DVR (playback) depth selection
Publishing and viewing stream links
You can select the stream latency:

Standard - optimal mode for most streams
Low - reduced latency (most viewers will experience less than 10 sec latency)
DVR (playback) is the ability to rewind a stream even while it's live. Viewers can start watching from the beginning or return to missed moments. DVR is available for streams with standard latency. You can select the DVR depth from the dropdown menu. Maximum depth is 12 hours.

The system automatically generates necessary publishing data:

Publishing URLs (primary and backup)
Unique stream key
The backup URL is recommended when sufficient bandwidth is available - this ensures additional stream reliability. For publishing multiple quality levels in some encoders (e.g., Wirecast), streams need to be specified separately.

Videoplayer
After receiving publishing links and configuring the encoder, we recommend testing the stream for proper operation.

You can view your stream on the stream editing page in the player block.



Clicking the "Configure" button under the player will redirect you to the player settings page, where you can choose your preferred viewing method: viewing created streams separately or all streams together in one player. Below the viewing method selection form, you can find the playlist link and code for embedding the player on your web page.



Attention

Use the "Code for embedding" frame to place the player on your resource.

Streaming configuration
Advanced broadcasting settings are available in the "Streaming configuration" block.



Stream Settings
You can create up to 10 streams of different quality

Open the "Streaming configuration" section
Use the "Add Stream" button to create a new stream
For each stream specify:
Clear name for easy management
Resolution from the provided list
Remove unused streams if necessary
Save changes after configuration


Transcoding $
Transcoding is necessary for creating multibitrate streams. As output, you get several streams of different quality, allowing users to manually select their preferred option or leave adaptive streaming, which automatically adjusts based on the user's bandwidth. This eliminates buffering issues for viewers with slow internet and improves user experience.

To configure transcoding:

Select appropriate transcoding package
Save settings
To deactivate transcoding, click again on your selected transcoding package, then click the "Save" button at the bottom of the page.



Important transcoding considerations:

Only one input stream can be used
Various packages with different processing parameters are available
The system will automatically create streams of different quality
Stream Recording $
The Stream Recording feature enables archiving of live broadcasts for subsequent use.



Key Features:

Automatic selection of maximum available quality
Downloads accessible via the Records page
14-day retention period for records
Option to transfer to Media Storage for extended retention and processing
Operational Flow:

Activate the recording switch in stream settings
Recording initiates automatically upon stream detection
Stream Interruption Protocol:
System maintains 10-minute reconnection window
Recording continues to same file if stream resumes within window
Stream designated as complete after 10-minute timeout
Attention

Single record file capacity: 12 hours. System automatically generates new file upon reaching capacity
Default retention period: 14 days from creation
Records Management Interface

The Records page provides access to recorded streams and essential reference information.



Interface functionality includes:

Comprehensive record content viewer
File download capability
Media Storage transfer function
Monthly recording usage metrics
Content Access Restrictions $


In this section, you can set content distribution restrictions based on:

Country and region
IP address
Referer
User-Agent
Authorization restrictions
Module Configuration Process
Activate the type of restriction you need and choose the default rule (deny or allow).
Add exceptions to the default rule. For geo-restrictions, also select a rule for the exception itself. This way, you can, for example, deny traffic for an entire country while allowing it for a specific region.
If necessary, set time intervals for the rule's validity. Intervals should not overlap.
It's possible to add several different rules of each type, provided their time intervals do not overlap.
Authorization by Secret Key
Description:

Authorization of user requests is performed exclusively in the CDN network, external resources are not used. The decision to access a stream is made by means of our network based on the criteria specified by the content owner:

Secret key. It is checked that the link was generated by the content owner.
The URI of the requested stream. It is checked that the link was generated specifically for this stream.
User's IP address (optional). It is checked that the stream was requested from exactly the IP address for which the link was generated. You can disable the check by selecting the "Do not impose IP address filter" option.
The expiration time of the link (optional). You can turn off the check by selecting the "Do not impose time restrictions" option.
At the moment the user accesses a protected stream, the content owner needs to generate a special link.

Example:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

The link contains authorization parameter md5(<md5 hash>[,<expires>]):

<md5 hash> - MD5 hash in Base64 format for URL, generated based on secret key, URI of the requested stream, user's IP address (optional) and link lifetime (optional);
<expires> is the expiration time of the link in POSIX time format (optional).
When accessing content using the generated link, the CDN calculates the MD5 value and compares it with the received one. If the MD5 value does not match, then a 403 Forbidden response is returned to the user (access is denied).

If the current time exceeds the value <expires>, then a response with the code 410 Gone (the target stream is no longer available) is returned to the user.

Algorithm for generating an MD5 hash (<md5_hash>) for signing links:

Form the signature string <secret_word><path_to_stream><ip><expire_time>. The <ip> and/or <expire_time> elements are not added to the signature string if Do not impose IP address filter and/or Do not impose time restrictions is specified in the local authorization settings.
Generate base64_url via base64_url(md5(<signature string>)).
Generate the <md5 hash> signature by performing the following substitutions in base64_url:
replace the = character with the empty string ''.
replace the + character with -
replace the / character with _
Form the link using the obtained signature <md5 hash>.
Attention

The domain part of the URI is not used when calculating the hash!
You can sign part of the path (for example, for /path/to/stream, you can sign the stream itself, /path/to, /path)
When generating MD5, the URL should not contain urlencoded characters, but should contain the original characters: cyrillic, spaces, percentages, etc. Then you should request the urlencoded version of the URL with this hash.
The MD5 hash calculated for HTTP is the baseline for this stream. The same hash will be used for links to a stream over the HTTP, HTTPS protocols, despite the fact that the URI for different protocols may differ slightly.
Example of link generation:

There are the following input data:

Secret key: zah5Mey9Quu8Ea1k
User IP address: 1.2.3.4
Stream URI: http://example.a.trbcdn.net/path/to/stream/playlist.m3u8
Expiration time of the link: 1704067200
Form the signature string <secret_word><path_to_stream><ip><expire_time>. Let's assume that we include both IP address and link expiration time.

Then the signature string looks like this: zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200

Generate <md5 hash>:

PHP example:


$ php -r 'print str_replace("=", "",strtr(base64_encode(md5("zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200", TRUE)), "+/", "-_")) . "\n";'
HucJ8tJFjy97yuox2OycOQ

#!/usr/bin/python3
import base64
import hashlib

secret_word = 'zah5Mey9Quu8Ea1k'
path = '/path/to/stream'
ip_address = '1.2.3.4'
expiration_timestamp = 1704067200

def generate_local_signature(secret_word, path, ip_address=None, timestamp=None):
    string_to_sign = f'{secret_word}{path}'
    if ip_address is not None:
        string_to_sign = f'{string_to_sign}{ip_address}'
    if timestamp is not None:
        string_to_sign = f'{string_to_sign}{timestamp}'

    hashed_string = hashlib.md5(string_to_sign.encode()).digest()
    decoded_base64_string = base64.b64encode(hashed_string).decode()
    local_signature = decoded_base64_string.replace('+', '-').replace('/', '_').replace('=', '')
    return local_signature

print(generate_local_signature(secret_word, path, ip_address, expiration_timestamp))
# HucJ8tJFjy97yuox2OycOQ
Python example:

Result link:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

External Script Authorization
External authorization is designed to be able to restrict access to the stream with custom logic described in your authorization script. A decision to access the stream is made based on response of your script.

If the authorization script responded with status code = 200, then access to the stream is allowed. Otherwise, access is denied.

The following headers are passed to the authorization script:

Host: contains the domain name of the server for which the request is intended;
X-Request-URI: contains the URI of the requested stream;
X-Forwarded-For: contains the real IP address of the user;
X-Remote-Addr: contains the IP address of the user or the proxy server.
DVR (Live Stream Playback)
The DVR reset (button "Reset stored DVR") allows clearing the accumulated stream buffer and starting to form it anew. During reset, all previously accumulated content is deleted, and the DVR window starts filling from the current moment.



DVR reset may be needed in the following situations:

After technical stream failures
To clear buffer after test stream launch
When changing content within one stream
If accumulation needs to start from a specific moment
Important!

DVR reset cannot be undone
After reset, viewers won't be able to return to previously broadcast content
New accumulation begins immediately after reset
DVR window size remains the same
Restream
This section allows you to configure restreaming.

When you publish a stream to our media server (or we pull a stream from your server), we can forward it to other streaming platforms that you specify in the restreaming settings.

For more detailed information, see here.



Broadcast Page
The Broadcast Page provides a ready-to-use webpage with an embedded player for viewing your stream.



To get started click the "Get link" button in the "Broadcast page" section to create a unique URL.

Use the buttons next to the URL to:

Copy the URL to clipboard
Regenerate URL if needed
Password Protection

After generating the Broadcast Page Link, you can enable password protection to restrict access:

Password changes take effect within 30 seconds
Viewers will be prompted with a password entry form when accessing the page
Stream playback becomes available only after entering the correct password
This functionality enables access control for your stream and allows sharing the URL with a specific audience only.

SRT-publish
Overview
SRT (Secure Reliable Transport) is a modern protocol specifically designed for reliable video transmission over the internet.

SRT advantages:

Enhanced reliability with poor connection quality
Built-in data encryption
Automatic network condition adaptation
Minimal transmission delay
Connection Setup


The "Instructions" section contains all necessary data for starting a stream:

Stream latency selection
DVR (playback) depth selection
Publishing and viewing stream links
You can select the stream latency:

Standard - optimal mode for most streams
Low - reduced latency (most viewers will experience less than 10 sec latency)
DVR (playback) is the ability to rewind a stream even while it's live. Viewers can start watching from the beginning or return to missed moments. DVR is available for streams with standard latency. You can select the DVR depth from the dropdown menu. Maximum depth is 12 hours.

The system automatically generates necessary data for publishing:

Primary publishing URL
Backup URL for additional reliability
Videoplayer
After receiving publishing links and configuring the encoder, we recommend testing the stream for proper operation.

You can view your stream on the stream editing page in the player block.



Clicking the "Configure" button under the player will redirect you to the player settings page, where you can choose your preferred viewing method: viewing created streams separately or all streams together in one player. Below the viewing method selection form, you can find the playlist link and code for embedding the player on your web page.



Attention

Use the "Code for embedding" frame to place the player on your resource.

Streaming configuration
Advanced broadcasting settings are available in the "Streaming configuration" block.



Stream Settings
You can create up to 10 streams of different quality

Open the "Streaming configuration" section
Use the "Add Stream" button to create a new stream
For each stream specify:
Clear name for easy management
Resolution from the provided list
Remove unused streams if necessary
Save changes after configuration


Transcoding $
Transcoding is necessary for creating multibitrate streams. As output, you get several streams of different quality, allowing users to manually select their preferred option or leave adaptive streaming, which automatically adjusts based on the user's bandwidth. This eliminates buffering issues for viewers with slow internet and improves user experience.

To configure transcoding:

Select appropriate transcoding package
Save settings
To deactivate transcoding, click again on your selected transcoding package, then click the "Save" button at the bottom of the page.



Important transcoding considerations:

Only one input stream can be used
Various packages with different processing parameters are available
The system will automatically create streams of different quality
Stream Recording $
The Stream Recording feature enables archiving of live broadcasts for subsequent use.



Key Features:

Automatic selection of maximum available quality
Downloads accessible via the Records page
14-day retention period for records
Option to transfer to Media Storage for extended retention and processing
Operational Flow:

Activate the recording switch in stream settings
Recording initiates automatically upon stream detection
Stream Interruption Protocol:
System maintains 10-minute reconnection window
Recording continues to same file if stream resumes within window
Stream designated as complete after 10-minute timeout
Attention

Single record file capacity: 12 hours. System automatically generates new file upon reaching capacity
Default retention period: 14 days from creation
Records Management Interface

The Records page provides access to recorded streams and essential reference information.



Interface functionality includes:

Comprehensive record content viewer
File download capability
Media Storage transfer function
Monthly recording usage metrics
Content Access Restrictions $


In this section, you can set content distribution restrictions based on:

Country and region
IP address
Referer
User-Agent
Authorization restrictions
Module Configuration Process
Activate the type of restriction you need and choose the default rule (deny or allow).
Add exceptions to the default rule. For geo-restrictions, also select a rule for the exception itself. This way, you can, for example, deny traffic for an entire country while allowing it for a specific region.
If necessary, set time intervals for the rule's validity. Intervals should not overlap.
It's possible to add several different rules of each type, provided their time intervals do not overlap.
Authorization by Secret Key
Description:

Authorization of user requests is performed exclusively in the CDN network, external resources are not used. The decision to access a stream is made by means of our network based on the criteria specified by the content owner:

Secret key. It is checked that the link was generated by the content owner.
The URI of the requested stream. It is checked that the link was generated specifically for this stream.
User's IP address (optional). It is checked that the stream was requested from exactly the IP address for which the link was generated. You can disable the check by selecting the "Do not impose IP address filter" option.
The expiration time of the link (optional). You can turn off the check by selecting the "Do not impose time restrictions" option.
At the moment the user accesses a protected stream, the content owner needs to generate a special link.

Example:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

The link contains authorization parameter md5(<md5 hash>[,<expires>]):

<md5 hash> - MD5 hash in Base64 format for URL, generated based on secret key, URI of the requested stream, user's IP address (optional) and link lifetime (optional);
<expires> is the expiration time of the link in POSIX time format (optional).
When accessing content using the generated link, the CDN calculates the MD5 value and compares it with the received one. If the MD5 value does not match, then a 403 Forbidden response is returned to the user (access is denied).

If the current time exceeds the value <expires>, then a response with the code 410 Gone (the target stream is no longer available) is returned to the user.

Algorithm for generating an MD5 hash (<md5_hash>) for signing links:

Form the signature string <secret_word><path_to_stream><ip><expire_time>. The <ip> and/or <expire_time> elements are not added to the signature string if Do not impose IP address filter and/or Do not impose time restrictions is specified in the local authorization settings.
Generate base64_url via base64_url(md5(<signature string>)).
Generate the <md5 hash> signature by performing the following substitutions in base64_url:
replace the = character with the empty string ''.
replace the + character with -
replace the / character with _
Form the link using the obtained signature <md5 hash>.
Attention

The domain part of the URI is not used when calculating the hash!
You can sign part of the path (for example, for /path/to/stream, you can sign the stream itself, /path/to, /path)
When generating MD5, the URL should not contain urlencoded characters, but should contain the original characters: cyrillic, spaces, percentages, etc. Then you should request the urlencoded version of the URL with this hash.
The MD5 hash calculated for HTTP is the baseline for this stream. The same hash will be used for links to a stream over the HTTP, HTTPS protocols, despite the fact that the URI for different protocols may differ slightly.
Example of link generation:

There are the following input data:

Secret key: zah5Mey9Quu8Ea1k
User IP address: 1.2.3.4
Stream URI: http://example.a.trbcdn.net/path/to/stream/playlist.m3u8
Expiration time of the link: 1704067200
Form the signature string <secret_word><path_to_stream><ip><expire_time>. Let's assume that we include both IP address and link expiration time.

Then the signature string looks like this: zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200

Generate <md5 hash>:

PHP example:


$ php -r 'print str_replace("=", "",strtr(base64_encode(md5("zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200", TRUE)), "+/", "-_")) . "\n";'
HucJ8tJFjy97yuox2OycOQ

#!/usr/bin/python3
import base64
import hashlib

secret_word = 'zah5Mey9Quu8Ea1k'
path = '/path/to/stream'
ip_address = '1.2.3.4'
expiration_timestamp = 1704067200

def generate_local_signature(secret_word, path, ip_address=None, timestamp=None):
    string_to_sign = f'{secret_word}{path}'
    if ip_address is not None:
        string_to_sign = f'{string_to_sign}{ip_address}'
    if timestamp is not None:
        string_to_sign = f'{string_to_sign}{timestamp}'

    hashed_string = hashlib.md5(string_to_sign.encode()).digest()
    decoded_base64_string = base64.b64encode(hashed_string).decode()
    local_signature = decoded_base64_string.replace('+', '-').replace('/', '_').replace('=', '')
    return local_signature

print(generate_local_signature(secret_word, path, ip_address, expiration_timestamp))
# HucJ8tJFjy97yuox2OycOQ
Python example:

Result link:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

External Script Authorization
External authorization is designed to be able to restrict access to the stream with custom logic described in your authorization script. A decision to access the stream is made based on response of your script.

If the authorization script responded with status code = 200, then access to the stream is allowed. Otherwise, access is denied.

The following headers are passed to the authorization script:

Host: contains the domain name of the server for which the request is intended;
X-Request-URI: contains the URI of the requested stream;
X-Forwarded-For: contains the real IP address of the user;
X-Remote-Addr: contains the IP address of the user or the proxy server.
DVR (Live Stream Playback)
The DVR reset (button "Reset stored DVR") allows clearing the accumulated stream buffer and starting to form it anew. During reset, all previously accumulated content is deleted, and the DVR window starts filling from the current moment.



DVR reset may be needed in the following situations:

After technical stream failures
To clear buffer after test stream launch
When changing content within one stream
If accumulation needs to start from a specific moment
Important!

DVR reset cannot be undone
After reset, viewers won't be able to return to previously broadcast content
New accumulation begins immediately after reset
DVR window size remains the same
Restream
This section allows you to configure restreaming.

When you publish a stream to our media server (or we pull a stream from your server), we can forward it to other streaming platforms that you specify in the restreaming settings.

For more detailed information, see here.



Broadcast Page
The Broadcast Page provides a ready-to-use webpage with an embedded player for viewing your stream.



To get started click the "Get link" button in the "Broadcast page" section to create a unique URL.

Use the buttons next to the URL to:

Copy the URL to clipboard
Regenerate URL if needed
Password Protection

After generating the Broadcast Page Link, you can enable password protection to restrict access:

Password changes take effect within 30 seconds
Viewers will be prompted with a password entry form when accessing the page
Stream playback becomes available only after entering the correct password
This functionality enables access control for your stream and allows sharing the URL with a specific audience only.

HLS-pull
Overview
With this method, content is loaded into the distribution server's cache from the source server upon the first user request and is used to serve subsequent requests. Objects are stored in the cache for a specified period.

This method is suitable if you have an existing stream in the following protocols:

Adobe HDS
Apple HLS
Microsoft Smooth Streaming (MSS)
Stream format transformation is not performed with this method.

Videoplayer
After configuring the resource, you can verify the broadcast functionality. The switch allows you to view both the source and output streams.



Clicking the "Configure" button below the player redirects you to the player settings page, where you can specify the stream URL for testing. Here you can also find the final playlist link and the code for embedding the player on your webpage.



Please note

Use the "Embed Code" frame to place the player on your resource.

Streaming configuration
The "Streaming configuration" block provides access to advanced broadcasting settings. Here you can fine-tune various parameters of your stream.



Data Source

If you have multiple content sources (primary/backup), you can add them to a Domain Group and configure the priority for each. If the "highest priority" source becomes unavailable, the CDN network will automatically switch to the next source. It will automatically switch back to the priority source once it's functioning normally again.

You can configure Weight and Max fails for each source.

Weight is a numerical value that determines what proportion of requests a specific server should receive. The higher the weight, the more requests will be directed to that server. The default weight is 1.

Max_fails - this parameter defines the number of failed connection attempts to a server, after which Nginx will consider it unavailable for a certain period. The default max_fails value is 10.

Use HTTPS When Requesting Sources
By default, requests to sources are made using HTTPS. Here you can disable the use of HTTPS if needed.

You can also enable source certificate verification by selecting the corresponding option.



Please note

The "Verify source certificate" option is only available when "Use HTTPS for source requests" is enabled.

Specifying an SNI Host

The additional option to specify an SNI host (Server Name Indication) allows you to manually define the hostname sent during the TLS handshake with the origin server. This functionality is particularly useful in the following cases:

When using virtual hosting, where a single IP address serves multiple domains
When non-standard configurations are required for specific hosts
To ensure proper handling of SSL/TLS certificates in multiple-domain configurations. For example, if your origin server hosts both 'example.com' and 'example.net' on the same IP address, specifying the SNI host ensures that the correct SSL/TLS certificate is presented during the handshake.
Hostname When Requesting Source
If you're using hosting services such as Wix, Amazon S3, Selectel, etc., please pay special attention to the Hostname section.



Many virtual hosting services (such as Amazon S3) host multiple websites on a single web server. For CDN nodes to access your content correctly, you need to specify the correct Hostname.

Follow these steps if you're unsure about your Hostname:

Visit your website and right-click on any image to copy its link.
Paste this link into a new browser window. The resulting domain is your site's Content Source. For example, if your site is hosted on Wix, the content source domain will be static.wixstatic.com
Go to https://check-host.net and enter your website's domain (not the content source domain).
On the "Information" tab, look for the "Resource Name" - this is your Hostname. For instance, if you're using Amazon hosting, your Hostname might look like: ec7-54-151-126-156.eu-west-1.compute.amazonaws.com
Enter this Hostname in your account dashboard
AWS Authorization
You can use AWS authorization when requesting from sources. To do this, select the corresponding option and enter two keys: the access key and the secret key.



Caching
Here you can specify caching times based on response codes (2xx, 3xx, 4xx, 5xx) and set the option to ignore caching control headers ("Expires" and "Cache-Control").



Initially, each user has basic time settings, but these can be customized.

Important

The cache duration settings are specified in seconds

Ignore caching control headers

If the content source (origin) responses already contain Cache-Control and/or Expires headers, caching is performed for the time specified in these headers. To change this behavior, enable Ignore caching control headers. In this case, caching will be performed for the time specified in this section. The specified caching time will also be used for content source (origin) responses that do not contain caching control headers.

Please note

Invalid header values (Expires with a past time, or Cache-control: private) disable caching, which often leads to increased load on the content source (origin).

Using Stale Content in CDN



The Use Stale option allows the CDN to serve previously cached versions of content when fetching up-to-date data from the origin server is not possible. This functionality ensures continuous content availability and helps minimize service disruptions for users.

When the "Serve Stale Content on Origin Unavailability" option is enabled, the system will return cached content in the following cases:

error - an error occurred while establishing a connection with the server, passing a request to it, or reading the response header.
timeout - a timeout has occurred while establishing a connection with the server, passing a request to it, or reading the response header.
invalid_header - a server returned an empty or invalid response.
updating - permits using a stale cached response if it is currently being updated.
http_500 - a server returned a response with the code 500.
http_502 - a server returned a response with the code 502.
http_503 - a server returned a response with the code 503.
http_504 - a server returned a response with the code 504.
In these scenarios, the user will receive the most recent cached version of the requested resource instead of an error message. This provides a better user experience during temporary issues with the origin server.

Stale conditions

Here you can set a list of conditions to give outdated cached content if the origin is unavailable (the enabled Use Stale setting is required).

List of available options:

error - an error occurred while establishing a connection with the server, passing a request to it, or reading the response header.
timeout - a timeout has occurred while establishing a connection with the server, passing a request to it, or reading the response header.
invalid_header - a server returned an empty or invalid response.
updating - permits using a stale cached response if it is currently being updated.
http_500 - a server returned a response with the code 500.
http_502 - a server returned a response with the code 502.
http_503 - a server returned a response with the code 503.
http_504 - a server returned a response with the code 504.
http_403 - a server returned a response with the code 403.
http_404 - a server returned a response with the code 404.
http_429 - a server returned a response with the code 429.
Cache considering query string



When this option is enabled, query string parameters will be taken into account when caching content.

Query string whitelist

The Query String Whitelist defines a list of allowed query parameters (request arguments), which are taken into account when caching. Any query parameters not included in this list are ignored during request processing.

Warning

By default, the Query String Whitelist is empty, meaning that all query string parameters in the request are included in cache key generation and processing.

Query string blacklist

The Query String Blacklist defines a list of disabled query parameters (request arguments), which are taken into account when caching. Any query parameters included in this list are ignored during request processing.

Warning

By default, the Query String Blacklist is empty, meaning that all query string parameters in the request are included in cache key generation and processing.

If you want to redefine whitelist/blacklist, then you need to disable the option "Consider all query string parameters" and set parameter lists.



Warning

You can set only one of the 2 properties: either whitelist or blacklist.

Cache Based on Cookies



When the "Cache Based on Cookies" option is enabled, the system will take cookie parameters into account when caching content. This allows for the creation of separate cache versions for different cookie values.

Cookies Whitelist

The Cookies Whitelist allows you to specify a list of cookies that should be considered during caching and other cookie-related operations. All other cookies not included in this list are ignored by the system.

Warning

By default, the Cookies Whitelist is empty, meaning that all cookie parameters are included in cache key generation and request processing

Cookies Blacklist

The Cookies Blacklist allows you to specify a list of cookies that should be not considered during caching and other cookie-related operations. All other cookies included in this list are ignored by the system.

Warning

By default, the Cookies Blacklist is empty, meaning that all cookie parameters are included in cache key generation and request processing

If you want to redefine whitelist/blacklist, then you need to disable the option "Consider all parameters" and set parameter lists.



Warning

You can set only one of the 2 properties, either whitelist or blacklist.

This approach helps:

Avoid cache redundancy
Retain only the necessary data for personalization
Optimize storage of dynamic content
CNAME
A CNAME record allows you to assign an alias to a host. This alias typically associates a specific function with the host or simply shortens its name.

By default, your content is accessible at: example.a.trbcdn.net/images/1.jpg

With CNAME, you can set up access at: cdn.example.com/images/1.jpg

Creating a CNAME record:

Open the DNS management page on your DNS hosting site
Create a new CNAME record with the following parameters:
Name (Host): "cdn" Note: Some control panels may require you to specify the full subdomain name, e.g., cdn.example.com
Value: example.a.trbcdn.net. (note the period at the end)
Waiting for changes to apply:

DNS changes may take up to 72 hours to take effect
Verifying the setup:

After the waiting period, check if your content is accessible at the new address
Use DNS checking tools to confirm the correct setup
HTTPS Distribution via CNAME (SSL Certificate)
By default, after saving the settings, your content will be accessible via HTTPS The standard URL will look like: https://example.a.trbcdn.net

If you plan to use an SSL certificate, you have two main options:

a) Upload your own certificate:

Prepare your SSL certificate in advance
Upload it before or after creating the resource
Select the uploaded certificate from the list of available ones when configuring the resource
b) Issue a Let's Encrypt certificate:

Choose the option to issue a Let's Encrypt certificate in the resource settings
The system will automatically generate and configure the certificate for your resource
Content Access Restrictions $


In this section, you can set content distribution restrictions based on:

Country and region
IP address
Referer
User-Agent
Authorization restrictions
Module Configuration Process
Activate the type of restriction you need and choose the default rule (deny or allow).
Add exceptions to the default rule. For geo-restrictions, also select a rule for the exception itself. This way, you can, for example, deny traffic for an entire country while allowing it for a specific region.
If necessary, set time intervals for the rule's validity. Intervals should not overlap.
It's possible to add several different rules of each type, provided their time intervals do not overlap.
Authorization by Code Word
Description:

Authorization of user requests is performed exclusively in the CDN network, external resources are not used. The decision to access a stream is made by means of our network based on the criteria specified by the content owner:

Secret key. It is checked that the link was generated by the content owner.
The URI of the requested stream. It is checked that the link was generated specifically for this stream.
User's IP address (optional). It is checked that the stream was requested from exactly the IP address for which the link was generated. You can disable the check by selecting the "Do not impose IP address filter" option.
The expiration time of the link (optional). You can turn off the check by selecting the "Do not impose time restrictions" option.
At the moment the user accesses a protected stream, the content owner needs to generate a special link.

Example:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

The link contains authorization parameter md5(<md5 hash>[,<expires>]):

<md5 hash> - MD5 hash in Base64 format for URL, generated based on secret key, URI of the requested stream, user's IP address (optional) and link lifetime (optional);
<expires> is the expiration time of the link in POSIX time format (optional).
When accessing content using the generated link, the CDN calculates the MD5 value and compares it with the received one. If the MD5 value does not match, then a 403 Forbidden response is returned to the user (access is denied).

If the current time exceeds the value <expires>, then a response with the code 410 Gone (the target stream is no longer available) is returned to the user.

Algorithm for generating an MD5 hash (<md5_hash>) for signing links:

Form the signature string <secret_word><path_to_stream><ip><expire_time>. The <ip> and/or <expire_time> elements are not added to the signature string if Do not impose IP address filter and/or Do not impose time restrictions is specified in the local authorization settings.
Generate base64_url via base64_url(md5(<signature string>)).
Generate the <md5 hash> signature by performing the following substitutions in base64_url:
replace the = character with the empty string ''.
replace the + character with -
replace the / character with _
Form the link using the obtained signature <md5 hash>.
Attention

The domain part of the URI is not used when calculating the hash!
You can sign part of the path (for example, for /path/to/stream, you can sign the stream itself, /path/to, /path)
When generating MD5, the URL should not contain urlencoded characters, but should contain the original characters: cyrillic, spaces, percentages, etc. Then you should request the urlencoded version of the URL with this hash.
The MD5 hash calculated for HTTP is the baseline for this stream. The same hash will be used for links to a stream over the HTTP, HTTPS protocols, despite the fact that the URI for different protocols may differ slightly.
Example of link generation:

There are the following input data:

Secret key: zah5Mey9Quu8Ea1k
User IP address: 1.2.3.4
Stream URI: http://example.a.trbcdn.net/path/to/stream/playlist.m3u8
Expiration time of the link: 1704067200
Form the signature string <secret_word><path_to_stream><ip><expire_time>. Let's assume that we include both IP address and link expiration time.

Then the signature string looks like this: zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200

Generate <md5 hash>:

PHP example:


$ php -r 'print str_replace("=", "",strtr(base64_encode(md5("zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200", TRUE)), "+/", "-_")) . "\n";'
HucJ8tJFjy97yuox2OycOQ

#!/usr/bin/python3
import base64
import hashlib

secret_word = 'zah5Mey9Quu8Ea1k'
path = '/path/to/stream'
ip_address = '1.2.3.4'
expiration_timestamp = 1704067200

def generate_local_signature(secret_word, path, ip_address=None, timestamp=None):
    string_to_sign = f'{secret_word}{path}'
    if ip_address is not None:
        string_to_sign = f'{string_to_sign}{ip_address}'
    if timestamp is not None:
        string_to_sign = f'{string_to_sign}{timestamp}'

    hashed_string = hashlib.md5(string_to_sign.encode()).digest()
    decoded_base64_string = base64.b64encode(hashed_string).decode()
    local_signature = decoded_base64_string.replace('+', '-').replace('/', '_').replace('=', '')
    return local_signature

print(generate_local_signature(secret_word, path, ip_address, expiration_timestamp))
# HucJ8tJFjy97yuox2OycOQ
Python example:

Result link:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

Authorization by External Script
External authorization is designed to be able to restrict access to the stream with custom logic described in your authorization script. A decision to access the stream is made based on response of your script.

If the authorization script responded with status code = 200, then access to the stream is allowed. Otherwise, access is denied.

The following headers are passed to the authorization script:

Host: contains the domain name of the server for which the request is intended;
X-Request-URI: contains the URI of the requested stream;
X-Forwarded-For: contains the real IP address of the user;
X-Remote-Addr: contains the IP address of the user or the proxy server.
Additional content distribution areas $
This option allows you to configure content delivery parameters beyond the main service area.



Connection
Switch the toggle to Turned on
Select one or more zones:
EMEA (Europe, Middle East, and Africa)
APAC (Asia-Pacific)
AM (Americas)
Click the Apply button
Wait for some time while the settings are applied to the network
HTTPS Configuration
Enable HTTPS distribution in the additional zones settings
Select a certificate from the list of existing ones or upload a new one
Important!

When updating the SSL certificate in the main resource, the certificate in additional distribution zones is not automatically updated. You need to manually update the certificate in the additional zones settings.

When receiving a new certificate:

Update the certificate in the main resource settings
Update the certificate in the additional distribution zones settings
Expert settings
Attention!

This section is intended for advanced users and allows for fine-tuning of the CDN resource.

Timeouts
In this section, you can specify acceptable timeouts for CDN nodes when accessing your origin. If the actual values start to exceed the acceptable ones, a switch to another content source specified in the Data Source section will occur.



Use HTTP3
By default, the HTTP/2.0 protocol is supported. Enable this option if HTTP3 support is required.

Headers
In this section, you can specify special headers that need to be added when accessing the data source (To source), or when delivering content to end users (For client).



Hide-in-response option

The Hide-in-response option is used to remove specific HTTP headers from the response sent to the client, which can help improve security or reduce unnecessary information exposure.

CORS Check on CDN Side
Description
In some cases, a browser may treat a request to access to certain content hosted on a CDN network as a cross-domain request and block it. It is primarily related to fonts. The issue is addressed by setting CORS (Cross-Origin Resource Sharing) headers for cached objects.

There are two options:

You can set CORS headers on the origin server and disable their verification in our network yourself.
You can set up CORS verification in the Your Account section in our network.
Setup in Dashboard
The CORS verification procedure provided for configuration is based on our proprietary module operation. Its functionality is based on W3C recommendations.

Module Operation Fundamentals:

Where CORS is enabled, Access-Control-* headers from the origin are always ignored and excluded from the response.

Any request without Origin header is not a cross-resource request, and Access-Control-* headers are not transmitted to the client.

Our module never adds Access-Control-Request-* headers, since they are incoming request headers generated by the browser, same as Origin.

Where there is an Origin header, its contents will be matched against that set by the user. In the absence of restrictions, the Access-Control-Allow-Origin response header will include "*", while where there are any restrictions and where Origin is on the allowed list, then ACAO will include http(s?)://${http_origin}; otherwise, the response will include Access-Control-* headers.

Access-Control-Expose-Headers headers are added, if such headers are set by the user. By default, we state a permission to access Content-Range for the operation of range-requests (for JS-based players).

Access-Control-Allow-Credentials (ACAC) headers are included in accordance to that set by the user.

Access-Control-Allow-Methods, Access-Control-Allow-Headers, and Access-Control-Max-Age headers are included only in a response to a request based on the OPTIONS method, which is processed locally and not forwarded to the origin.

Access-Control-Allow-Methods header is set to be equal to the contents of the Access-Control-Request-Method header, if such header is present and is on the list of simple requests (GET, HEAD, POST), or a list set by the user. Where the method is not on the allowed list, then the response will not include Access-Control-* headers. If a request does not contain Access-Control-Request-Method, no Access-Control-Allow-Methods will be set.

Access-Control-Allow-Headers is set to be equal to the contents of the Access-Control-Request-Headers header, if such header is present, Access-Control-Request-Method request header is present, and all headers are on the list of simple headers (Accept, Accept-Language, Content-Type, Content-Language) or on the user-set list. Where at least one header is not on the allowed list, then the response will not contain Access-Control-* headers. Where a request does not contain Access-Control-Request-Method and Access-Control-Request-Headers, Access-Control-Allow-Headers will not be stated.

Access-Control-Max-Age header will be stated in accordance with that set by the user, but not by default.

Any additional response header, specified by the client, will be added/overridden after CORS module processing, while, for example, Access-Control-Allow-Origin: * in header sections will be added irrespective of the CORS module operation results.

Module Configuration Process
CORS verification is active by default. If CORS authorization is disabled, all preflight requests will be forwarded to your origin. The headers, described above and set on the origin, will not be affected and will be transmitted unchanged to end users.

You may adjust the module operation by setting the following parameters:

Allowed Domains (not verified by default, all domains are allowed)

Values may set by either of the following methods:

example.com – exact match
*.example.com - all subdomains example.com exclusive of example.com
.example.com – all Level 3 domains inclusive of example.com
~a\d+\.example.com – regular expression
Secure Request Headers

Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma are allowed by default. You may add your headers to this list.

Upper Level API Accessible Headers (Expose Headers)

Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma are allowed by default. You may add your headers to this list.

Safe Methods

GET, HEAD, POST are allowed by default. You may add your methods to this list.

Access-Control-Allow-Credentials Header

Cookies, sessions, authorizations are incompatible with caching services due to their operating logic. However, if you need to set an Access-Control-Allow-Credentials header, you can do it.

Preflight Request Response Lifetime

A period of time during which a response to a Preflight request is deemed to be relevant.

Attention!

Irrespective of whether CORS authorization is enabled/disabled and its operation results, you may manually redefine any header for responses to end users. To this end, specify its name and desired value in "Headers" section. Authorization header value will be substituted with that specified by you after the CORS verification stage completion.

Rules
This section is designed for finer control of CDN network operation. Individual rules for any section/path allow managing headers, caching, CORS, authorization, and other parameters.

Rule Creation
To create a rule, specify the path to the directory or specific file to which this rule should be applied.



Please note

When configuring rules, it is important to remember that the characters ~ or ~* must be specified to use regular expressions in the path.

~ is used to define case-sensitive matching
~* is used to define case-insensitive matching
Rule Configuration
Rule configuration is set up similarly to the configuration for the entire resource.

Headers, content access restrictions, and CORS verification for specific paths (rules) are configured similarly to the options for the entire resource.

HTTP Response Status Configuration
In this option, you can configure special rules for returned HTTP statuses. The following configuration options are available:

Status Code and Response Text:
Specify the HTTP status to return
Optionally add text to be sent in the response body
Status Code and Redirection:
For redirection codes (301, 302, 303, 307, 308), specify the URL where the user will be directed
URL can be either absolute (starting with http:// or https://) or relative
RTMP/RTSP/SRT-pull
Instruction


The "Instructions" section contains all necessary data for starting a stream:

Stream latency selection
DVR (playback) depth selection
Viewing stream links
You can select the stream latency:

Standard - optimal mode for most streams
Low - reduced latency (most viewers will experience less than 10 sec latency)
DVR (playback) is the ability to rewind a stream even while it's live. Viewers can start watching from the beginning or return to missed moments. DVR is available for streams with standard latency. You can select the DVR depth from the dropdown menu. Maximum depth is 12 hours.

Videoplayer
You can view your stream on the stream editing page in the player block.



Clicking the "Configure" button under the player will redirect you to the player settings page, where you can choose your preferred viewing method: viewing created streams separately or all streams together in one player. Below the viewing method selection form, you can find the playlist link and code for embedding the player on your web page.



Attention

Use the "Code for embedding" frame to place the player on your resource.

Streaming configuration
In the "Streaming configuration" section, you can set up pull parameters and configure advanced broadcasting settings.



Stream Settings
In this section, you can configure the pull parameters for streams of different quality.

Open the "Streaming configuration" section
Use the "Add Stream" button to create a new stream
For each stream specify:
Clear name for easy management
Resolution from the provided list
Primary address
Backup address
Remove unused streams if necessary
Save changes after configuration


Please note

Available protocols: RTMP, RTSP, SRT

Transcoding
Transcoding is necessary for creating multibitrate streams. As output, you get several streams of different quality, allowing users to manually select their preferred option or leave adaptive streaming, which automatically adjusts based on the user's bandwidth. This eliminates buffering issues for viewers with slow internet and improves user experience.

To configure transcoding:

Select appropriate transcoding package
Save settings
To deactivate transcoding, click again on your selected transcoding package, then click the "Save" button at the bottom of the page.



Important transcoding considerations:

Only one input stream can be used
Various packages with different processing parameters are available
The system will automatically create streams of different quality
Stream Recording
The Stream Recording feature enables archiving of live broadcasts for subsequent use.



Key Features:

Automatic selection of maximum available quality
Downloads accessible via the Records page
14-day retention period for records
Option to transfer to Media Storage for extended retention and processing
Operational Flow:

Activate the recording switch in stream settings
Recording initiates automatically upon stream detection
Stream Interruption Protocol:
System maintains 10-minute reconnection window
Recording continues to same file if stream resumes within window
Stream designated as complete after 10-minute timeout
Attention

Single record file capacity: 12 hours. System automatically generates new file upon reaching capacity
Default retention period: 14 days from creation
Records Management Interface

The Records page provides access to recorded streams and essential reference information.



Interface functionality includes:

Comprehensive record content viewer
File download capability
Media Storage transfer function
Monthly recording usage metrics
Content Access Restrictions


In this section, you can set content distribution restrictions based on:

Country and region
IP address
Referer
User-Agent
Authorization restrictions
Module Configuration Process
Activate the type of restriction you need and choose the default rule (deny or allow).
Add exceptions to the default rule. For geo-restrictions, also select a rule for the exception itself. This way, you can, for example, deny traffic for an entire country while allowing it for a specific region.
If necessary, set time intervals for the rule's validity. Intervals should not overlap.
It's possible to add several different rules of each type, provided their time intervals do not overlap.
Authorization by Secret Key
Description:

Authorization of user requests is performed exclusively in the CDN network, external resources are not used. The decision to access a stream is made by means of our network based on the criteria specified by the content owner:

Secret key. It is checked that the link was generated by the content owner.
The URI of the requested stream. It is checked that the link was generated specifically for this stream.
User's IP address (optional). It is checked that the stream was requested from exactly the IP address for which the link was generated. You can disable the check by selecting the "Do not impose IP address filter" option.
The expiration time of the link (optional). You can turn off the check by selecting the "Do not impose time restrictions" option.
At the moment the user accesses a protected stream, the content owner needs to generate a special link.

Example:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

The link contains authorization parameter md5(<md5 hash>[,<expires>]):

<md5 hash> - MD5 hash in Base64 format for URL, generated based on secret key, URI of the requested stream, user's IP address (optional) and link lifetime (optional);
<expires> is the expiration time of the link in POSIX time format (optional).
When accessing content using the generated link, the CDN calculates the MD5 value and compares it with the received one. If the MD5 value does not match, then a 403 Forbidden response is returned to the user (access is denied).

If the current time exceeds the value <expires>, then a response with the code 410 Gone (the target stream is no longer available) is returned to the user.

Algorithm for generating an MD5 hash (<md5_hash>) for signing links:

Form the signature string <secret_word><path_to_stream><ip><expire_time>. The <ip> and/or <expire_time> elements are not added to the signature string if Do not impose IP address filter and/or Do not impose time restrictions is specified in the local authorization settings.
Generate base64_url via base64_url(md5(<signature string>)).
Generate the <md5 hash> signature by performing the following substitutions in base64_url:
replace the = character with the empty string ''.
replace the + character with -
replace the / character with _
Form the link using the obtained signature <md5 hash>.
Attention

The domain part of the URI is not used when calculating the hash!
You can sign part of the path (for example, for /path/to/stream, you can sign the stream itself, /path/to, /path)
When generating MD5, the URL should not contain urlencoded characters, but should contain the original characters: cyrillic, spaces, percentages, etc. Then you should request the urlencoded version of the URL with this hash.
The MD5 hash calculated for HTTP is the baseline for this stream. The same hash will be used for links to a stream over the HTTP, HTTPS protocols, despite the fact that the URI for different protocols may differ slightly.
Example of link generation:

There are the following input data:

Secret key: zah5Mey9Quu8Ea1k
User IP address: 1.2.3.4
Stream URI: http://example.a.trbcdn.net/path/to/stream/playlist.m3u8
Expiration time of the link: 1704067200
Form the signature string <secret_word><path_to_stream><ip><expire_time>. Let's assume that we include both IP address and link expiration time.

Then the signature string looks like this: zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200

Generate <md5 hash>:

PHP example:


$ php -r 'print str_replace("=", "",strtr(base64_encode(md5("zah5Mey9Quu8Ea1k/path/to/stream1.2.3.41704067200", TRUE)), "+/", "-_")) . "\n";'
HucJ8tJFjy97yuox2OycOQ

#!/usr/bin/python3
import base64
import hashlib

secret_word = 'zah5Mey9Quu8Ea1k'
path = '/path/to/stream'
ip_address = '1.2.3.4'
expiration_timestamp = 1704067200

def generate_local_signature(secret_word, path, ip_address=None, timestamp=None):
    string_to_sign = f'{secret_word}{path}'
    if ip_address is not None:
        string_to_sign = f'{string_to_sign}{ip_address}'
    if timestamp is not None:
        string_to_sign = f'{string_to_sign}{timestamp}'

    hashed_string = hashlib.md5(string_to_sign.encode()).digest()
    decoded_base64_string = base64.b64encode(hashed_string).decode()
    local_signature = decoded_base64_string.replace('+', '-').replace('/', '_').replace('=', '')
    return local_signature

print(generate_local_signature(secret_word, path, ip_address, expiration_timestamp))
# HucJ8tJFjy97yuox2OycOQ
Python example:

Result link:

http://example.a.trbcdn.net/md5(HucJ8tJFjy97yuox2OycOQ,1704067200)/path/to/stream/playlist.m3u8

External Script Authorization
External authorization is designed to be able to restrict access to the stream with custom logic described in your authorization script. A decision to access the stream is made based on response of your script.

If the authorization script responded with status code = 200, then access to the stream is allowed. Otherwise, access is denied.

The following headers are passed to the authorization script:

Host: contains the domain name of the server for which the request is intended;
X-Request-URI: contains the URI of the requested stream;
X-Forwarded-For: contains the real IP address of the user;
X-Remote-Addr: contains the IP address of the user or the proxy server.
DVR (Live Stream Playback)
The DVR reset (button "Reset stored DVR") allows clearing the accumulated stream buffer and starting to form it anew. During reset, all previously accumulated content is deleted, and the DVR window starts filling from the current moment.



DVR reset may be needed in the following situations:

After technical stream failures
To clear buffer after test stream launch
When changing content within one stream
If accumulation needs to start from a specific moment
Important!

DVR reset cannot be undone
After reset, viewers won't be able to return to previously broadcast content
New accumulation begins immediately after reset
DVR window size remains the same
Restream
This section allows you to configure restreaming.

When you publish a stream to our media server (or we pull a stream from your server), we can forward it to other streaming platforms that you specify in the restreaming settings.

For more detailed information, see here.



Broadcast Page
The Broadcast Page provides a ready-to-use webpage with an embedded player for viewing your stream.



To get started click the "Get link" button in the "Broadcast page" section to create a unique URL.

Use the buttons next to the URL to:

Copy the URL to clipboard
Regenerate URL if needed
Password Protection

After generating the Broadcast Page Link, you can enable password protection to restrict access:

Password changes take effect within 30 seconds
Viewers will be prompted with a password entry form when accessing the page
Stream playback becomes available only after entering the correct password
This functionality enables access control for your stream and allows sharing the URL with a specific audience only.

Storage $
Description
The "Storage" service allows you to store any files and work with mp4 video files.

To get started, select the "Storage" section in the side menu. When using it for the first time, you need to initialize the service by clicking the "Activate" button.



"My Files" Page
The page consists of five main parts:

top menu
list of files and folders
statistics widget showing used space and conversion minutes for the current month
S3 keys
CDN domain


Top Menu
The following functions are available in the top menu:

uploading files from device
creating a new folder
refreshing the file list
searching within the current folder
File List
Files are displayed in a table showing the file name, available qualities, last modified time, and size. The list header shows the current path with the ability to navigate to parent folders. Each file and folder has a context menu with the following actions:

Download (files only)
Copy file link (files only)
Rename
Move
Remove


S3 keys
This section displays the parameters required to connect to the storage’s S3 interface:

Endpoint - the address of the S3 server you will connect to
Access key - the public identifier used when connecting to S3
Secret key - the private key used together with the Access key to securely access the storage


More details about S3 and working with it can be found here.

CDN domain
This section provides:

The CDN domain that can be used to distribute Storage files via CDN
The status of the CDN domain
By clicking "Configure", you will be taken to the CDN domain settings page.



"File View" Page
Clicking on a file in the list either initiates a download or (for mp4) redirects to the viewing page.



The video viewing page offers:

Videoplayer
Mediafile actions
Links for viewing via streaming protocols (HLS, MPEG-DASH)
Mediafile qualities
Important

We do not support Fragmented MP4 container for viewing using streaming protocols. You can check the container using the command: MP4Box -info test.mp4

Video Viewing Method Widget
Two viewing modes are available:

"Union streams" - with quality switcher in the player
"Each quality separately" - viewing selected quality without switching capability


When selecting individual qualities, a menu appears for choosing specific quality for viewing.



Please note

If the video has only one quality, viewing mode switching is unavailable.

Transcoded qualities
This widget displays the available video qualities.

Each quality can be downloaded or deleted.

To generate a new quality, use the "Mediafile actions" → "Transcoding" page.



"Player configuration" Page
On the player configuration page, you can:

Select a player template from the available options
Override the parameters of the selected player (title, poster, subtitles, markers, background color)


After making changes, the configuration will be saved and applied on the “File Preview” and “Player configuration” pages for the current video file.

"Mediafile actions" Page
Transcoding
The "Transcoding" section shows the qualities available for converting the current video.



To transcode:

Select the desired qualities from the list
Click "Apply"
After transcoding, the qualities will appear in the "Transcoded qualities" section
Cut
The cutting tool includes a player and two sliders to select a time interval.

By adjusting the sliders, you can set the start and end points of the current video. After trimming, the resulting file will contain only the video within this interval.



To trim a video:

Set the boundaries of the desired segment using the sliders
Specify the folder to save the result and the name of the output file
Click "Apply"


Restream $
Description
The service allows you to redirect live video broadcasts of events to several streaming platforms at once. When you publish a stream to our media server, we redirect it to other streaming platforms that you specified in the settings of the resource.

Important!

To configure a restream resource, you must have RTMP/RTSP-publish resource that you want to restream.

Resource Creation
To get started, you need to create a restreaming resource. To do this, on the left in your personal account, select the "Streaming" section, the "Restream" tab, then in the upper right corner, click "Add resource".

You`ll see a dialogue window with configurations for restream.

Resource Configuration
Resource name
The name of the resource is generated automatically. If necessary, you can change it in the field.



Type of restream
Choose the type of restream resource that is preferable in your case.



Attention

Short restream type is suitable for broadcasting sporting events, webinars.

Long restream type is suitable for long broadcasts of television channels.

Source stream
At this step, you should select the stream that you want to restream to other platforms. Select the resource that contains the desired source stream, and then the stream itself in the drop-down lists.



Attention

If the "Transcoding" service is activated for the selected source stream, then it will be possible to select the "Restream transcoded streams" option. If the option is selected, it becomes possible to set restream targets for specific resolutions.

Restream targets
At this step, you should specify the parameters of the restream targets, i.e. media platforms to which you want to restream the source stream.

In the drop-down list, select the media platform for restream.

In the input fields, specify the URL of the restream target and the stream key. These parameters must be obtained from the media platforms on which you want to restream. Examples of obtaining parameters of restream targets on some popular media platforms are given below.

Use the icons on the right side of the input fields to add/remove restream targets or display additional settings.



Important!

It`s not available to create more than 10 restream targets for one source stream.

Attention

If the option "Restream transcoded streams" was selected in the previous step, the block "Transcoded streams restream targets" is displayed. This block is similar to the "Restream targets" block, only a certain stream resolution after transcoding will use as the source stream for restream.

To complete the creation of a restream resource, click on the "CREATE RESOURCE" button.

Resource created! You are redirected to the "Resource Settings" tab, on which, if necessary, you can change the previously specified resource settings.

Restream status
Attention

To start restreaming, you should publish the stream specified as the source for the resource.

After the source stream is published, you can check the status of the restream. To do this, go to the "Status" tab.

This tab displays the realtime status of the restream, which is updated every 5 seconds. It is presented in the form of a table in which the statuses for each restream of the source stream to different targets are indicated.



Possible Restream Statuses:

Restream status	Description
OK	Restream is up and working correctly
Stream is not published	Restream is not started because source stream was not published
Error	Restream is up, but does not work correctly due to an error. Check the correctness of the specified resource parameters
On the same page you can make sure that there are no problems with your source stream. To do this, the player is displayed on the page and you can play the source stream.



Restream charging
Service is charged per restreaming set. Set is defined as restreaming of one source stream to 1-3 primary targets. Any primary target in set is allowed to have one corresponding backup target.

"Short restream" is charged for each restreaming session per set. Sessions with breaks longer than 30 minutes are considered to be separate sessions. Session longer than 10 hours is counted as a sequence of separate 10 hours sessions.

"Long restream" is charged on a monthly basis for every configured restreaming set.

Getting Restream Target Parameters
When setting up a restream resource, you need to specify the restream targets to which we will restream the source stream.

To do this, you need to get the target URL and the stream key from the media platform.

YouTube*
First you need to go to "YouTube Studio".

After that, in the upper right corner of the channel dashboard, click the "CREATE" button and select "Go live" in the drop-down list.



A form with the parameters of the created stream will open. Fill in the required fields and click "CREATE STREAM".



In the window that opens, on the tab "STREAM SETTINGS", the parameters of the restream target are indicated:

stream key;
stream URL;
backup server URL.


Specify these parameters when creating/editing a restream resource.

* The service supports streaming video to third-party platforms. The functionality of the service provides an exclusively technical possibility of data transmission using protocols supported by third parties. The user independently determines the list of platforms used by him and is responsible for compliance with the requirements of applicable legislation when using them.

VK
First you need to go to the "Video" section.

After that, in the upper right corner of the page, click the "New stream" button.



A form with the parameters of the created stream will open. Fill in the required fields.



Expand the item "Encoder settings" by clicking on it. Here are the parameters of the restream target:

URL (stream URL);
KEY (stream key).


Specify these parameters when creating/editing a restream resource.

OK
First you need to go to the main page of the social network.

Click the "Broadcast" button.



In the window that appears, select "Application".



A form with the parameters of the broadcast will open. Fill in the required fields.



In the lower left corner of the settings is the item "Video coder settings". Here are the parameters of the restream target:

server URL (stream URL);
broadcast key (stream key).


Specify these parameters when creating/editing a restream resource.

Telegram*
You need to have your own channel for restream to Telegram.

You can create it as follows: click on the menu in the upper left corner, select "New channel", specify a name and description, invite users.



To start live stream, in the upper right corner of the control panel, in the live stream menu, select "Stream with..." in the drop-down list.



Here are the parameters of the restream target in the "Stream with other app" window:

Server URL (stream URL);
Stream Key.


Specify these parameters when creating/editing a restream resource and click "Start Streaming".

* The service supports streaming video to third-party platforms. The functionality of the service provides an exclusively technical possibility of data transmission using protocols supported by third parties. The user independently determines the list of platforms used by him and is responsible for compliance with the requirements of applicable legislation when using them.

 Back to top


Recommended stream settings
Determining the optimal stream settings to use to deliver video is difficult even if you've been streaming for years.

Here are the settings that we recommend:

Video codec: H.264
Frame rate: 25 fps
Keyframe frequency: 1 second
Audio codec: AAC
Audio bitrate: 128 Kbps, stereo
Audio sample rate: 48000 Гц
Recommended video stream parameters:

Profile	Resolution	Bitrate
240p	Baseline	426x240	512 Kbps
360p	Main	640x360	1024 Kbps
480p	Main	854x480	1600 Kbps
720p	Main	1280x720	2640 Kbps
1080p	Main	1920x1080	4400 Kbps
4K	High	3840x2160	12000 Kbps
To manually calculate the optimal bitrate, you can use the following formula:


bitrate = (resolution * frames per second * BPP) / 1000
where BPP (Bits per pixel) - average amount of bits applied to each pixel of a video.
BPP typically ranges from 0.05 to 0.150, depending on the amount of motion in the scene. The more motion there is, the higher the BPP should be.

BPP examples:

quiet video: BPP = 0.05
average dynamic video: BPP = 0.08
sports broadcast: BPP = 0.13
 Back to top

Есть еще Описание API и Настройки энкодеров, если надо скажи я сделаю