---
title: "Working with oneof protobuf fields"
description: "I send a note to my future self about protobuf oneof fields."
date: "2024-07-16"
---

---

Though I've used `oneof` protobuf fields before at work, I wanted to write a note to my future self to make it that much easier the next time I work with them.

## My use case

I'm working on my [Cloud Inventory project](https://danielhoward-dev.netlify.app/blog/project-planning/). I have to persist the details of accounts that IT admins would connect to my application. Since these accounts can be with AWS, GCP, or Azure, I want to use a JSONB column to store account metadata. When I read this data, I want to be able to unmarshal the JSON into structs specific to the provider. To support this generic field, `metadata`, in the protobufs that define my API, I turned to a [oneof protobuf field](https://protobuf.dev/programming-guides/proto3/#oneof).

From the docs: <blockquote>If you have a message with many fields and where at most one field will be set at the same time, you can enforce this behavior and save memory by using the oneof feature.<br /><br />Oneof fields are like regular fields except all the fields in a oneof share memory, and at most one field can be set at the same time. Setting any member of the oneof automatically clears all the other members.</blockquote>

I only ever want to set the metadata with one kind of provider-specific JSON, so `oneof` fits my use case. Here are my protobuf message definitions:

```protobuf
message Provider {
    string id = 1;
    string external_identifier = 2;
	string name = 3;
    string provider_name = 4;
    string organization_id = 5;
    oneof metadata {
    AWSMetdata aws_metadata = 6;
    GCPMetdata gcp_metadata = 7;
    AzureMetadata azure_metadata = 8;
  }
}

message AWSMetdata {
  // AWS-specific fields
}

message GCPMetdata {
  // GCP-specific fields
}

message AzureMetadata {
  // Azure-specific fields
}
```

## Working with it

I ran into issues working with this field when I was converting a DAO layer struct into the protoc-generated structs. I deserialized the JSONB column into a `[]byte` with the intent of unmarshaling into one of the provider-specific structs. My first attempt looked something like this (`err` checks omitted):

```go
// providerspb is the protoc-generated package
pbProvider := &providerspb.Provider{
    Id:                 provider.ID,
    ExternalIdentifier: provider.ExternalIdentifier,
    Name:               provider.Name,
    ProviderName:       provider.ProviderName,
    OrganizationId:     provider.OrganizationID,
}
var err error
switch provider.ProviderName { // provider is the DAO layer struct
case "AWS":
    var awsMetadata providerspb.AwsMetadata
    err = json.Unmarshal(provider.Metadata, &awsMetadata)
    pbProvider.Metadata = &awsMetadata
case "GCP":
    var gcpMetadata providerspb.GcpMetadata
    err = json.Unmarshal(provider.Metadata, &gcpMetadata)
    pbProvider.Metadata = &gcpMetadata
case "AZURE":
    var azureMetadata providerspb.AzureMetadata
    err = json.Unmarshal(provider.Metadata, &azureMetadata)
    pbProvider.Metadata = &azureMetadata
default:
    return nil, status.Errorf(codes.Internal, "invalid provider_name")
}
```

This didn't work. I had to unmarshal into a `map[string]interface{}`, log the map keys, and cross-reference the field names in the generated code to see what I was doing wrong:

```go
var err2 error
metadataMap := make(map[string]interface{})
err2 = json.Unmarshal(daoLayerProvider.Metadata, &metadataMap) // the `Metadata` field is defined as []byte `json:"metadata"`
fmt.Printf("%+v", metadataMap) // map[aws_metadata:map[role_arn:arn:aws:iam::ACCOUNT_ID:role/ReadOnlyRole]]
```

This log output clued me into the fact that I was unmarshaling into the wrong struct. We need to take a look at the protoc-generated code to where I went astray.

## Under the hood

Here's the protoc-generated struct in Go:

```go
type Provider struct {
	state         protoimpl.MessageState
	sizeCache     protoimpl.SizeCache
	unknownFields protoimpl.UnknownFields

	Id                 string `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
	ExternalIdentifier string `protobuf:"bytes,2,opt,name=external_identifier,json=externalIdentifier,proto3" json:"external_identifier,omitempty"`
	Name               string `protobuf:"bytes,3,opt,name=name,proto3" json:"name,omitempty"`
	ProviderName       string `protobuf:"bytes,4,opt,name=provider_name,json=providerName,proto3" json:"provider_name,omitempty"`
	OrganizationId     string `protobuf:"bytes,5,opt,name=organization_id,json=organizationId,proto3" json:"organization_id,omitempty"`
	// Types that are assignable to Metadata:
	//	*Provider_AwsMetadata
	//	*Provider_GcpMetadata
	//	*Provider_AzureMetadata
	Metadata isProvider_Metadata `protobuf_oneof:"metadata"`
}
```

The comment says it all. I was trying to unmarshal the `metadata` field into the provider-specific structs: `AwsMetadata|GcpMetadata|AzureMetadata`, when really I needed to use the `isProvider_Metadata`.

But what is that field? It's not a message type I defined in proto file. Interface, you say? Check out the big brain on you! The types in the comment (part of the generated code) are all structs that implement the interface:

```go
type isProvider_Metadata interface {
	isProvider_Metadata()
}

type Provider_AwsMetadata struct {
	AwsMetadata *AWSMetdata `protobuf:"bytes,6,opt,name=aws_metadata,json=awsMetadata,proto3,oneof"`
}

type Provider_GcpMetadata struct {
	GcpMetadata *GCPMetdata `protobuf:"bytes,7,opt,name=gcp_metadata,json=gcpMetadata,proto3,oneof"`
}

type Provider_AzureMetadata struct {
	AzureMetadata *AzureMetadata `protobuf:"bytes,8,opt,name=azure_metadata,json=azureMetadata,proto3,oneof"`
}

func (*Provider_AwsMetadata) isProvider_Metadata() {}

func (*Provider_GcpMetadata) isProvider_Metadata() {}

func (*Provider_AzureMetadata) isProvider_Metadata() {}
```

The updated code then (just one case for brevity):

```go
case "AWS":
    var awsMetadata providerspb.Provider_AwsMetadata
    err2 = json.Unmarshal(provider.Metadata, &awsMetadata)
    pbProvider.Metadata = &awsMetadata
```

It worked after I made this change, right? Right? No, it didn't. I was working on this API that read data before implementing the API that writes this data. In order to test, I was `exec`-ing into a `postgres` Docker container and inserting data into the table manually, including the JSONB column:

```sql
INSERT INTO 
    providers(external_identifier, display_name, provider_name, metadata, organization_id)
    values('ACCOUNT_ID', 'My AWS acct', 'AWS', '{"aws_metadata": {"role_arn": "arn:aws:iam::ACCOUNT_ID:role/ReadOnlyRole"}}', '51207fbd-87dd-48bb-b9b8-904832ead230');
```

What did that log statement print out for the map?

```
map[aws_metadata:map[role_arn:arn:aws:iam::ACCOUNT_ID:role/ReadOnlyRole]]
```

And what did protoc generate for this field?

```go
type Provider_AwsMetadata struct {
	AwsMetadata *AWSMetdata `protobuf:"bytes,6,opt,name=aws_metadata,json=awsMetadata,proto3,oneof"`
}
```

So I was bit by a snake_case 🐍 in the grass. Once I updated the JSONB data to `awsMetadata` everything unmarshaled perfectly :/