#!/bin/bash

# Function to convert YAML to ENV format
convert_yaml_to_env() {
    # Check if yq is installed
    if ! command -v yq &> /dev/null
    then
        echo "yq is required but not installed. Please install yq first."
        exit 1
    fi

    # Convert YAML to ENV format
    yq eval -o=props 'config.yaml' > stack.env

    # Add comments for clarity
    sed -i '1i# Generated from config.yaml' stack.env
}

# Check if stack.env exists
if [ -f "stack.env" ]
then
    echo "Using existing stack.env file"
elif [ -f "config.yaml" ]
then
    echo "Converting config.yaml to stack.env"
    convert_yaml_to_env
else
    echo "Error: Neither stack.env nor config.yaml found"
    exit 1
fi

# Validate required variables
required_vars=("TELEGRAM_BOT_TOKEN" "TELEGRAM_CHANNEL_ID" "SAFE_ADDRESSES")
missing_vars=0

while IFS='=' read -r key value
do
    # Skip comments and empty lines
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue
    
    # Remove any leading/trailing whitespace
    key=$(echo $key | xargs)
    
    # Check if this is a required variable
    for required in "${required_vars[@]}"
    do
        if [[ $key == $required && -z $value ]]
        then
            echo "Error: $required is empty"
            missing_vars=1
        fi
    done
done < stack.env

if [ $missing_vars -eq 1 ]
then
    echo "Missing required variables"
    exit 1
fi

echo "Configuration validation successful"