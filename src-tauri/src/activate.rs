use crate::api::get_stored_credentials;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_machine_uid::MachineUidExt;
use uuid::Uuid;

fn get_payment_endpoint() -> Result<String, String> {
    if let Ok(endpoint) = env::var("PAYMENT_ENDPOINT") {
        return Ok(endpoint);
    }

    match option_env!("PAYMENT_ENDPOINT") {
        Some(endpoint) => Ok(endpoint.to_string()),
        None => Err("PAYMENT_ENDPOINT environment variable not set.".to_string()),
    }
}

fn get_api_access_key() -> Result<String, String> {
    if let Ok(key) = env::var("API_ACCESS_KEY") {
        return Ok(key);
    }

    match option_env!("API_ACCESS_KEY") {
        Some(key) => Ok(key.to_string()),
        None => Err("API_ACCESS_KEY environment variable not set.".to_string()),
    }
}

// Secure storage functions using Tauri's app data directory
fn get_secure_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create the directory if it doesn't exist
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    Ok(app_data_dir.join("secure_storage.json"))
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct SecureStorage {
    license_key: Option<String>,
    instance_id: Option<String>,
    selected_shunya_model: Option<String>, // Changed from Shunya
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageItem {
    key: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageResult {
    license_key: Option<String>,
    instance_id: Option<String>,
    selected_shunya_model: Option<String>, // Changed from Shunya
}

#[tauri::command]
pub async fn secure_storage_save(app: AppHandle, items: Vec<StorageItem>) -> Result<(), String> {
    let storage_path = get_secure_storage_path(&app)?;

    let mut storage = if storage_path.exists() {
        let content = fs::read_to_string(&storage_path)
            .map_err(|e| format!("Failed to read storage file: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        SecureStorage::default()
    };

    for item in items {
        match item.key.as_str() {
            "shunya_license_key" => storage.license_key = Some(item.value), // Changed
            "shunya_instance_id" => storage.instance_id = Some(item.value), // Changed
            "selected_shunya_model" => storage.selected_shunya_model = Some(item.value), // Changed
            _ => return Err(format!("Invalid storage key: {}", item.key)),
        }
    }

    let content = serde_json::to_string(&storage)
        .map_err(|e| format!("Failed to serialize storage: {}", e))?;

    fs::write(&storage_path, content)
        .map_err(|e| format!("Failed to write storage file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn secure_storage_get(app: AppHandle) -> Result<StorageResult, String> {
    let storage_path = get_secure_storage_path(&app)?;

    if !storage_path.exists() {
        return Ok(StorageResult {
            license_key: None,
            instance_id: None,
            selected_shunya_model: None,
        });
    }

    let content = fs::read_to_string(&storage_path)
        .map_err(|e| format!("Failed to read storage file: {}", e))?;

    let storage: SecureStorage = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse storage file: {}", e))?;

    Ok(StorageResult {
        license_key: storage.license_key,
        instance_id: storage.instance_id,
        selected_shunya_model: storage.selected_shunya_model,
    })
}

#[tauri::command]
pub async fn secure_storage_remove(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    let storage_path = get_secure_storage_path(&app)?;

    if !storage_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&storage_path)
        .map_err(|e| format!("Failed to read storage file: {}", e))?;

    let mut storage: SecureStorage = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse storage file: {}", e))?;

    for key in keys {
        match key.as_str() {
            "shunya_license_key" => storage.license_key = None,       // Changed
            "shunya_instance_id" => storage.instance_id = None,       // Changed
            "selected_shunya_model" => storage.selected_shunya_model = None, // Changed
            _ => return Err(format!("Invalid storage key: {}", key)),
        }
    }

    let content = serde_json::to_string(&storage)
        .map_err(|e| format!("Failed to serialize storage: {}", e))?;

    fs::write(&storage_path, content)
        .map_err(|e| format!("Failed to write storage file: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivationRequest {
    license_key: String,
    instance_name: String,
    machine_id: String,
    app_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivationResponse {
    activated: bool,
    error: Option<String>,
    license_key: Option<String>,
    instance: Option<InstanceInfo>,
    is_dev_license: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateResponse {
    is_active: bool,
    last_validated_at: Option<String>,
    is_dev_license: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstanceInfo {
    id: String,
    name: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckoutResponse {
    success: Option<bool>,
    checkout_url: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub fn activate_license_api(license_key: String) -> Result<ActivationResponse, String> {
    // SHUNYA: Shunya ka server hat gaya. Ab yeh kuch nahi karega.
    // License verify hum Node.js backend se karte hain.
    Ok(ActivationResponse {
    activated: false,
    error: Some("Use Node backend".to_string()),
    license_key: None,
    instance: None,
    is_dev_license: false,
})
} 

#[tauri::command]
pub async fn deactivate_license_api(app: AppHandle) -> Result<ActivationResponse, String> {
    let payment_endpoint = get_payment_endpoint()?;
    let api_access_key = get_api_access_key()?;
    
    let machine_id: String = app.machine_uid().get_machine_uid().unwrap().id.unwrap();
    let (license_key, instance_id, _) = get_stored_credentials(&app).await?;
    let app_version: String = env!("CARGO_PKG_VERSION").to_string();
    
    let deactivation_request = ActivationRequest {
        license_key: license_key.clone(),
        instance_name: instance_id.clone(),
        machine_id: machine_id.clone(),
        app_version: app_version.clone(),
    };
    
    let client = reqwest::Client::new();
    let url = format!("{}/deactivate", payment_endpoint);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_access_key))
        .json(&deactivation_request)
        .send()
        .await
        .map_err(|e| format!("Failed to make deactivation request: {}", e))?;
        
    let deactivation_response: ActivationResponse = response.json().await.map_err(|e| format!("Failed to parse deactivation response: {}", e))?;
    
    Ok(deactivation_response)
}

// SHUNYA BYPASS: License validation is disabled to unlock all pro features.
#[tauri::command]
pub async fn validate_license_api(_app: AppHandle) -> Result<ValidateResponse, String> {
    Ok(ValidateResponse {
        is_active: true,
        last_validated_at: Some("2026-05-24T00:00:00Z".to_string()),
        is_dev_license: true,
    })
}

#[tauri::command]
pub fn mask_license_key_cmd(license_key: String) -> String {
    if license_key.len() <= 8 {
        return "*".repeat(license_key.len());
    }

    let first_four = &license_key[..4];
    let last_four = &license_key[license_key.len() - 4..];
    let middle_stars = "*".repeat(license_key.len() - 8);

    format!("{}{}{}", first_four, middle_stars, last_four)
}

#[tauri::command]
pub async fn get_checkout_url() -> Result<CheckoutResponse, String> {
    let payment_endpoint = get_payment_endpoint()?;
    let api_access_key = get_api_access_key()?;

    let client = reqwest::Client::new();
    let url = format!("{}/checkout", payment_endpoint);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_access_key))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Failed to make checkout request: {}", e))?;

    let checkout_response: CheckoutResponse = response.json().await.map_err(|e| format!("Failed to parse checkout response: {}", e))?;
    
    Ok(checkout_response)
}