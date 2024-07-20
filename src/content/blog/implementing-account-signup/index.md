---
title: "Cloud Inventory: Implementing Signup"
description: "How I implemented a signup flow with email verification."
date: "2024-06-23"
---

---

## Story writing

I like to design features in terms of an increment of shippable customer value. I have a persona in mind and I write out the functionality the way I'd write a JIRA ticket.

- As an IT administrator, I want to be able to sign up for a Cloud Inventory account with my email and a password. I want my password stored in a secure manner, using a cryptographically secure hashing algorithm.
- As an IT administrator, I want a secure mechanism for verifying that I actually own the email address provided in the signup form.
- As an IT administrator, I want to get to the main content of the application once I finish verifying my email. I want to be taken to the page where I can onboard cloud providers.
- As an IT administrator, I want to be able to navigate across pages without having the re-authenticate. I expect a web app like this to manage authenticated sessions.
- As an IT administator, I want the web app to be personalized for me, showing my name and my organization's name.

## Thinking in data

Once I have the story written out, I work through what data each user action requires. The admin submits a form with email and their password. For personalizing the web app, the admin also tells us their name and the name of their organization. The data in the user action points to what the API request body has to contain, which I define in protobufs:

```protobuf
message SignupRequest {
  string organization_name = 1;
  string primary_administrator_email = 2;
  string primary_administrator_name = 3;
  string primary_administrator_cleartext_password = 4;
}
```

What's the business logic? Though it may be obvious that I have to persist the data submitted in the form, I like to follow the sequence of user actions in this feature and in the features that will build on it. What does signup trigger? It should trigger the application to persist the account and user data. Given the use case for Cloud Inventory—IT administrators viewing the cloud resources of their business, non-profit, government agency, etc.—I call the account an "organization" (rather than say, "company") and the user an "administrator". I'm using Postgres, so here is some starter SQL for creating the tables:

```sql
CREATE TABLE organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE administrators (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

The first and most important change I would want to make is to the `password` field. For an application like Cloud Inventory, in which the administrator will entrust us with read-only access to their cloud resources, security should be baked into every feature. I can't just store the cleartext of the password, so I'll use a hashing algorithm like BCrypt to hash it, store the hash, and change column name to `password_hash`. Let's say the business logic uses BCrypt for hashing. What if in five years time BCrypt is cracked and security researchers publish rainbow tables for it? I want to store an enum, `password_hash_type`, for the hash type used so we can always migrate to a new hash.

The next change I want to make is to capture the relational nature of these two tables. An administator is a member of an organization, so I'll want a foreign key, `organization_id`, that tells us which organization an administrator is a member of.

Is the organizations table complete? From the administrator user's perspective, it probably is. However, there are internal users to consider. The marketing team will likely have a sequence of welcome emails that nudge the administrator to getting started with the platform. For revenue teams, the table needs some data that captures how the account is billed, whether that's a tiered set of billing plans or metered usage. For support teams, the table may need a column that says who is the main point of contact for an account, or who is authorized to make privileged decisions. To address the needs of these internal users, I can add the `billing_plan_type` and `primary_administrator_email` columns. Obviously, if I were creating Cloud Inventory as a startup, I would put a lot of forethought and do research for the billing strategy best for the application. Since this is a personal project, I'll keep it simple with a tiered billing plan approach. Similarly, I'll keep it simple with a single email for the primary administrator. 

After creating an account, what's the next action a user will take? Though the user may want to dive into setting up authorization for AWS, the user will appreciate that Cloud Inventory verifies the email provided. If a user has not yet verified their email, the application will need to prevent access to everything but the signup and login forms. I persist a `verified` boolean column for the administrator that the backend can use to prevent authentication—an admin cannot log in until their email is verified. Since I'm using Vue for the frontend, I can use [meta fields in the vue-router](https://router.vuejs.org/guide/advanced/meta) to gate client-side routes behind successful authentication.

Turning to the happy path, how will successful email verification work? I need to send an email with a secret. I can use Go templating and an html template with a `{{ .Code }}` to delimit the dynamic part of the email with the secret code. I use an SMTP client for sending the rendered email to the admin. In local development, I use [maildev](https://github.com/maildev/maildev) as the SMPT server. The business logic will need a way of correlating the secret with the administator. Since this data is ephemeral—an admin only verifies their email one time—I want a lightweight, and fast, solution for persisting this link between the admin and the secret code. I landed on Redis for this implementation. The Redis key is a random string we send to the frontend and the value is JSON data with the secret code and the id of the administrator row so we can update the `verified` boolean when the code is correct.

On successful signup, I redirect to the same `/signup` client-side route with a `?token=<token-value-here>` query parameter, which is the random Redis key. The Vue component for the signup page has a `v-if` directive tied to the presence of this token and, when present, I render the email verification form rather than the account creation form. The admin enters the secret from the email, which triggers the form to submit the secret and the query parameter. The backend uses the query parameter to read the data from Redis and validates the secret code matches. On success, the backend updates the admin `verified` column, deletes the Redis data, and returns to the client a [JSON web token (JWT)](https://jwt.io/) to use for UI session management. The frontend stores the session JWT in localStorage. The meta field in the vue-router can stipulate what routes require authentication...

```javascript
    {
      path: '/home',
      name: 'home',
      meta: { requiresAuth: true },
      // lazy-load when the route is visited
      component: () => import('../views/HomeView.vue')
    }
```

...and I can define a router hook that validates the session JWT when the route requires auth:

```javascript
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const sessionJWT = localStorage.getItem(constants.localStorageKeys.sessionJWT);

  // authentication not required
  // let user navigate to the route
  if (!requiresAuth) {
    next();
    return
  }
  // authentication required and user has no session token
  // redirect to login
  if (requiresAuth && !sessionJWT) {
    next('/login');
    return
  }
  // auth required and user has a session JWT we can check
  // call the API and, on success, allow navigation
  // otherwise, redirect to login
  const formData = {
    jwt: sessionJWT,
  };
  const fetchOptions = {
      headers: {
      'Content-Type': 'application/json',
      },
      method: 'POST',
      mode: "cors",
      body: JSON.stringify(formData),
  };
  fetch('http://localhost:8080/v1/session', fetchOptions)
  .then(response => response.json())
  .then(data => {
    if (!data || !data.jwt) {
      next('/login');
      localStorage.removeItem(constants.localStorageKeys.sessionJWT);
      return
    }
    if (sessionJWT !== data.jwt) {
      next('/login');
      localStorage.removeItem(constants.localStorageKeys.sessionJWT);
      return
    }
    next();
    return
  })
  .catch(error => {
    console.error('Error submitting form:', error);
    next('/login');
    localStorage.removeItem(constants.localStorageKeys.sessionJWT);
  });
});
```

## JSON Web Tokens (JWT)

Let's take a look at the JWTs I use for session management. A JWT has 3 parts: header, payload, signature. The header and payload are JSON that is base64 encoded and concatenated together with a dot separator `.`.  The header says what algorithm was used for signing, such as HMAC SHA256, and the type of the token, which is JWT. The payload is a set of standard, or registered, claims, which include the issuer, the audience, the subject, and the expiration. I extend the claims with some custom ones for my application. The signature is the output of the signing algorithm given the header and payload (dot-separated) plus a secret:
```
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  secret)
```

The final output JWT looks like `<base64-encoded-header-JSON>.<base64-encoded-payload-JSON>.<base64-encoded-signature>`. If that sounds like word salad, here's a small Go program I wrote when trying to understand exactly how a JWT is constructed:

```go
package main

import (
   "crypto/hmac"
   "crypto/sha256"
   "encoding/base64"
   "encoding/json"
   "fmt"
   "log"
)


func main() {
  // header
   joseHeader := make(map[string]interface{})
   joseHeader["alg"] = "HS256"
   joseHeader["typ"] = "JWT"
   joseHeaderJSONBytes, err := json.Marshal(joseHeader)
   if err != nil {
       log.Fatalf("%s", err.Error())
   }
   joseHeaderBase64 := base64.RawURLEncoding.EncodeToString(joseHeaderJSONBytes)

   // payload
   jwtClaimsSet := make(map[string]interface{})
   jwtClaimsSet["name"] = "John Doe"
   jwtClaimsSetJSONBytes, err := json.Marshal(jwtClaimsSet)
   if err != nil {
       log.Fatalf("%s", err.Error())
   }
   jwtClaimsSetBase64 := base64.RawURLEncoding.EncodeToString(jwtClaimsSetJSONBytes)

   // signature
   data := joseHeaderBase64 + "." + jwtClaimsSetBase64
   h := hmac.New(sha256.New, []byte("your-256-bit-secret"))
   h.Write([]byte(data))
   signature := h.Sum(nil)
   base64EncodedSignature := base64.RawURLEncoding.EncodeToString(signature)

   // putting it all together
   finalJWT := data + "." + base64EncodedSignature
   fmt.Println(finalJWT) // prints eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSm9obiBEb2UifQ.DjwRE2jZhren2Wt37t5hlVru6Myq4AhpGLiiefF69u8
}
```

Though I wrote the program above to understand JWTs better, I use [a Go module](https://github.com/golang-jwt/jwt) for creating and validating JWTs in the Cloud Inventory backend. The main methods are `NewWithClaims` and `ParseWithClaims`. The former method essentially does exactly what my Go program does. The latter method parses out the header and payload, then uses the provided secret to perform signing again and match against the provided signature. Here's the critical code path for the HMAC SHA256 implementation of [this reproducing the signature part](https://github.com/golang-jwt/jwt/blob/62e504c2810b67f6b97313424411cfffb25e41b0/hmac.go#L70-L73).

Bringing it all together, I have built an account signup feature with email verification, client-side route protections, and JWT-based session management. Though account signup may seem pedestrian, it was very satisfying to build this feature in a robust, secure way. The final protobuf definitions for the APIs and the SQL for the organizations and administrators tables:

```protobuf
service AccountService {
  rpc Signup (SignupRequest) returns (SignupResponse) {
    option (google.api.http) = {
      post: "/v1/signup"
      body: "*"
    };
  }
  rpc Verify (VerificationRequest) returns (VerificationResponse) {
    option (google.api.http) = {
      post: "/v1/verify"
      body: "*"
    };
  }
}

message SignupRequest {
  string organization_name = 1;
  string primary_administrator_email = 2;
  string primary_administrator_name = 3;
  string primary_administrator_cleartext_password = 4;
}

message SignupResponse {
  string token = 1;
}

message VerificationRequest {
  string token = 1;
  string verification_code = 2;
}

message VerificationResponse {
  string jwt = 1;
}
```

```sql
CREATE TYPE billing_plan_type AS ENUM (
    'FREE',
    'PREMIUM'
);

CREATE TABLE organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    primary_administrator_email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    billing_plan_type billing_plan_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE password_hash_type AS ENUM (
    'BCRYPT'
);

CREATE TABLE administrators (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    password_hash_type password_hash_type NOT NULL,
    password_hash TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    organization_id UUID NOT NULL,
    CONSTRAINT fk_organization
        FOREIGN KEY(organization_id) 
        REFERENCES organizations(id)
        ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```