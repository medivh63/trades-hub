
use axum::{Router, routing::get};
use askama::Template;
use askama_escape::{escape, Html as EscapeHtml};
use axum::extract::State;
use axum::response::Html;
use serde::Deserialize;
use sqlx::Row;

use crate::db::Db;

pub fn public_routes() -> Router<Db> {
    Router::new()
        .route("/", get(index))
        .route("/search", get(search))
}

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    listings: Vec<ListingItem>,
}

struct ListingItem {
    id: i64,
    title: String,
    city: String,
    tags: Vec<String>,
    tag_summary: String,
    has_tags: bool,
    score: i64,
}

async fn index(State(db): State<Db>) -> Html<String> {
    let rows = sqlx::query(
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
    .unwrap_or_default();

    let listings = rows
        .into_iter()
        .enumerate()
        .map(|(idx, r)| {
            let id: i64 = r.get("id");
            let title: String = r.get("title");
            let city: Option<String> = r.try_get("city").unwrap_or(None);
            let tags_raw: Option<String> = r.try_get("tags").unwrap_or(None);
            let tags = tags_raw
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
                .collect::<Vec<_>>();
            let has_tags = !tags.is_empty();
            let tag_summary = if has_tags {
                tags.join(", ")
            } else {
                "暂无标签".to_string()
            };
            let score = 120_i64
                .saturating_sub((idx as i64) * 5)
                .max(5);

            ListingItem {
                id,
                title,
                city: city.unwrap_or_else(|| "城市未填写".to_string()),
                tags,
                tag_summary,
                has_tags,
                score,
            }
        })
        .collect::<Vec<_>>();

    match (IndexTemplate { listings }).render() {
        Ok(body) => Html(body),
        Err(err) => {
            tracing::error!(?err, "failed to render template");
            Html(String::new())
        }
    }
}

#[derive(Deserialize)]
struct SearchQs { q: Option<String> }

async fn search(
    State(db): State<Db>,
    axum::extract::Query(qs): axum::extract::Query<SearchQs>,
) -> Html<String> {
    let q = qs.q.unwrap_or_default();
    let rows = sqlx::query(
        r#"
        SELECT l.id, l.title, l.city, l.tags
        FROM listings_fts f
        JOIN listings l ON l.id = f.rowid
        WHERE listings_fts MATCH ?
        AND l.is_active = 1
        ORDER BY rank
        LIMIT 20
        "#,
    )
    .bind(&q)
    .fetch_all(&db)
    .await
    .unwrap_or_default();

    let mut html = String::from("<ol class=\"story-list\">");
    if rows.is_empty() {
        html.push_str(
            "<li class=\"story-item story-empty\"><div class=\"story-vote\"><span class=\"vote-triangle\">&#9651;</span><span class=\"story-score\">0</span></div><div class=\"story-body\"><div class=\"story-title-line\"><span class=\"story-title\">没有匹配的技工</span></div><div class=\"story-meta\">换个关键词再试试。</div></div></li>",
        );
    } else {
        for (idx, r) in rows.into_iter().enumerate() {
            let id: i64 = r.get("id");
            let title: String = r.get("title");
            let city: Option<String> = r.try_get("city").unwrap_or_default();
            let tags: Option<String> = r.try_get("tags").unwrap_or_default();

            let score = 120_i64
                .saturating_sub((idx as i64) * 5)
                .max(5);

            let title_html = escape(&title, EscapeHtml).to_string();
            let city_text = city.unwrap_or_else(|| "城市未填写".to_string());
            let city_html = escape(city_text.trim(), EscapeHtml).to_string();

            let mut tag_plain = Vec::new();
            let mut tag_badges = Vec::new();
            if let Some(tags_str) = tags {
                for tag in tags_str.split(',') {
                    let trimmed = tag.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let safe = escape(trimmed, EscapeHtml).to_string();
                    tag_plain.push(safe.clone());
                    tag_badges.push(format!("<span class=\"story-tag\">{}</span>", safe));
                }
            }
            let tag_summary = if tag_plain.is_empty() {
                "暂无标签".to_string()
            } else {
                tag_plain.join(", ")
            };
            let tags_block = if tag_badges.is_empty() {
                String::new()
            } else {
                format!("<div class=\"story-tags\">{}</div>", tag_badges.join(""))
            };

            html.push_str(&format!(
                "<li class=\"story-item\"><div class=\"story-vote\"><span class=\"vote-triangle\">&#9651;</span><span class=\"story-score\">{score}</span></div><div class=\"story-body\"><div class=\"story-title-line\"><a class=\"story-title\" href=\"/listings/{id}\">{title}</a><span class=\"story-domain\">{city}</span></div><div class=\"story-meta\">via {city} · {summary}</div>{tags}</div></li>",
                score = score,
                id = id,
                title = title_html,
                city = city_html,
                summary = tag_summary,
                tags = tags_block
            ));
        }
    }
    html.push_str("</ol>");
    Html(html)
}
