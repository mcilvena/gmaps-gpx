1. Create IAM role (if you don't have one):
   aws iam create-role --role-name lambda-basic-execution \
    --assume-role-policy-document
   '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
2. Create the Lambda:
   make create-lambda AWS_REGION=ap-southeast-2
3. Update web/config.js with the Function URL printed by the command
4. Deploy to S3:
   make deploy S3_BUCKET=your-bucket
