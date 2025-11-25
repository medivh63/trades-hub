
use axum::{Router, routing::get, response::IntoResponse};
use askama::Template;
use axum::extract::State;
use axum::response::Html;
use serde::Deserialize;
use sqlx::Row;

use crate::db::Db;

pub fn public_routes() -> Router<Db> {
    Router::new()
        .route("/", get(index))
        .route("/search", get(search))
        .route("/api/city-listings", get(city_listings))
}

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    listings: Vec<ListingItem>,
}

#[derive(Template)]
#[template(path = "search_results.html")]
struct SearchResultsTemplate {
    listings: Vec<ListingItem>,
}

#[derive(Clone)]
struct ListingItem {
    id: i64,
    title: String,
    city: String,
    tags: Vec<String>,
    tag_summary: String,
    has_tags: bool,
    score: i64,
}

// 辅助函数：解析 tags 字符串
fn parse_tags(tags_str: Option<String>) -> Vec<String> {
    tags_str
        .unwrap_or_default()
        .split(',')
        .filter_map(|tag| {
            let trimmed = tag.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect()
}

// 辅助函数：计算 score
fn calculate_score(index: usize) -> i64 {
    120_i64
        .saturating_sub((index as i64) * 5)
        .max(5)
}

// 辅助函数：从数据库行构建 ListingItem
fn row_to_listing_item(row: sqlx::sqlite::SqliteRow, index: usize) -> anyhow::Result<ListingItem> {
    let id: i64 = row.get("id");
    let title: String = row.get("title");
    let city: Option<String> = row.try_get("city").ok();
    let tags_raw: Option<String> = row.try_get("tags").ok();
    
    let tags = parse_tags(tags_raw);
    let has_tags = !tags.is_empty();
    let tag_summary = if has_tags {
        tags.join(", ")
    } else {
        "暂无标签".to_string()
    };
    let score = calculate_score(index);
    let city = city.unwrap_or_else(|| "城市未填写".to_string());

    Ok(ListingItem {
        id,
        title,
        city,
        tags,
        tag_summary,
        has_tags,
        score,
    })
}

async fn index(
    State(db): State<Db>,
    axum::extract::Query(qs): axum::extract::Query<IndexQs>,
) -> axum::response::Response {
    let city_filter = qs.city.as_deref().filter(|c| !c.is_empty());
    
    let rows = if let Some(city) = city_filter {
        // 如果指定了城市，按城市过滤
        match sqlx::query(
            r#"
            SELECT id, title, city, tags
            FROM listings
            WHERE is_active = 1
            AND (city = ? OR city LIKE ?)
            ORDER BY created_at DESC
            LIMIT 20
            "#,
        )
        .bind(city)
        .bind(format!("{}%", city))
        .fetch_all(&db)
        .await
        {
            Ok(rows) => rows,
            Err(err) => {
                tracing::error!(?err, city = %city, "failed to fetch listings by city");
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error",
                )
                    .into_response();
            }
        }
    } else {
        // 默认查询所有活跃列表
        match sqlx::query(
            r#"
            SELECT id, title, city, tags
            FROM listings
            WHERE is_active = 1
            ORDER BY created_at DESC
            LIMIT 20
            "#,
        )
        .fetch_all(&db)
        .await
        {
            Ok(rows) => rows,
            Err(err) => {
                tracing::error!(?err, "failed to fetch listings");
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error",
                )
                    .into_response();
            }
        }
    };

    let listings: Vec<ListingItem> = rows
        .into_iter()
        .enumerate()
        .filter_map(|(idx, row)| {
            match row_to_listing_item(row, idx) {
                Ok(item) => Some(item),
                Err(err) => {
                    tracing::warn!(?err, "failed to parse listing item");
                    None
                }
            }
        })
        .collect();

    match (IndexTemplate { listings }).render() {
        Ok(body) => Html(body).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to render template");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error",
            )
                .into_response()
        }
    }
}

#[derive(Deserialize)]
struct SearchQs { 
    q: Option<String>,
    city: Option<String>,
}

#[derive(Deserialize)]
struct IndexQs {
    city: Option<String>,
}

async fn search(
    State(db): State<Db>,
    axum::extract::Query(qs): axum::extract::Query<SearchQs>,
) -> axum::response::Response {
    let query = qs.q.as_deref().unwrap_or("").trim();
    
    // 如果查询为空，返回空结果
    if query.is_empty() {
        return Html(
            SearchResultsTemplate {
                listings: Vec::new(),
            }
            .render()
            .unwrap_or_default(),
        )
        .into_response();
    }

    // 清理和验证查询字符串，防止 SQL 注入（虽然使用参数化查询，但最好还是清理）
    let cleaned_query = query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || matches!(c, '-' | '_' | '|' | '*' | '"'))
        .collect::<String>();

    // 获取城市过滤条件
    let city_filter = qs.city.as_deref().filter(|c| !c.is_empty());

    let rows = if let Some(city) = city_filter {
        // 如果指定了城市，同时进行全文搜索和城市过滤
        match sqlx::query(
            r#"
            SELECT l.id, l.title, l.city, l.tags
            FROM listings_fts f
            JOIN listings l ON l.id = f.rowid
            WHERE f MATCH ?
            AND l.is_active = 1
            AND (l.city = ? OR l.city LIKE ?)
            ORDER BY rank
            LIMIT 20
            "#,
        )
        .bind(&cleaned_query)
        .bind(city)
        .bind(format!("{}%", city))
        .fetch_all(&db)
        .await
        {
            Ok(rows) => rows,
            Err(err) => {
                tracing::error!(?err, query = %cleaned_query, city = %city, "failed to search listings");
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error",
                )
                    .into_response();
            }
        }
    } else {
        // 只进行全文搜索，不过滤城市
        match sqlx::query(
            r#"
            SELECT l.id, l.title, l.city, l.tags
            FROM listings_fts f
            JOIN listings l ON l.id = f.rowid
            WHERE f MATCH ?
            AND l.is_active = 1
            ORDER BY rank
            LIMIT 20
            "#,
        )
        .bind(&cleaned_query)
        .fetch_all(&db)
        .await
        {
            Ok(rows) => rows,
            Err(err) => {
                tracing::error!(?err, query = %cleaned_query, "failed to search listings");
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error",
                )
                    .into_response();
            }
        }
    };

    let listings: Vec<ListingItem> = rows
        .into_iter()
        .enumerate()
        .filter_map(|(idx, row)| {
            match row_to_listing_item(row, idx) {
                Ok(item) => Some(item),
                Err(err) => {
                    tracing::warn!(?err, "failed to parse listing item");
                    None
                }
            }
        })
        .collect();

    match (SearchResultsTemplate { listings }).render()
    {
        Ok(body) => Html(body).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to render search template");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error",
            )
                .into_response()
        }
    }
}

// API 端点：根据城市获取列表（用于 HTMX 动态加载）
async fn city_listings(
    State(db): State<Db>,
    axum::extract::Query(qs): axum::extract::Query<IndexQs>,
) -> axum::response::Response {
    let city = qs.city.as_deref().filter(|c| !c.is_empty());
    
    if city.is_none() {
        return Html(
            SearchResultsTemplate {
                listings: Vec::new(),
            }
            .render()
            .unwrap_or_default(),
        )
        .into_response();
    }
    
    let city = city.unwrap();
    
    let rows = match sqlx::query(
        r#"
        SELECT id, title, city, tags
        FROM listings
        WHERE is_active = 1
        AND (city = ? OR city LIKE ?)
        ORDER BY created_at DESC
        LIMIT 20
        "#,
    )
    .bind(city)
    .bind(format!("{}%", city))
    .fetch_all(&db)
    .await
    {
        Ok(rows) => rows,
        Err(err) => {
            tracing::error!(?err, city = %city, "failed to fetch listings by city");
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error",
            )
                .into_response();
        }
    };

    let listings: Vec<ListingItem> = rows
        .into_iter()
        .enumerate()
        .filter_map(|(idx, row)| {
            match row_to_listing_item(row, idx) {
                Ok(item) => Some(item),
                Err(err) => {
                    tracing::warn!(?err, "failed to parse listing item");
                    None
                }
            }
        })
        .collect();

    match (SearchResultsTemplate { listings }).render() {
        Ok(body) => Html(body).into_response(),
        Err(err) => {
            tracing::error!(?err, "failed to render city listings template");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error",
            )
                .into_response()
        }
    }
}