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
- As an IT administator, I want the web app to be personalized for me, showing my organization's name and my name.

## Thinking in terms of data

Once I have the story written out, I work through what data each user action requires. The admin submits a form with email and their password. For personalizing the web app, the form also asks the admin for their organization's name and their name. The data in the user action points to what the API request body has to contain, which I define in protobufs:

```
message SignupRequest {
  string organization_name = 1;
  string primary_administrator_email = 2;
  string primary_administrator_name = 3;
  string primary_administrator_cleartext_password = 4;
}
```

What is the business logic? Though it may be obvious that the business logic has to persist the data submitted in the form, I like to follow the sequence user actions in this feature and in the features that will build on it. An admin will sign up for an account with this data and expect to be able to log in again with the same password.