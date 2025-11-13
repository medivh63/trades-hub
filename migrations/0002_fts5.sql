
PRAGMA trusted_schema = ON;

CREATE VIRTUAL TABLE listings_fts 
USING fts5(title, description, tags, content='listings', content_rowid='id');

CREATE TRIGGER listings_ai AFTER INSERT ON listings BEGIN
  INSERT INTO listings_fts(rowid, title, description, tags)
  VALUES (new.id, new.title, new.description, new.tags);
END;
CREATE TRIGGER listings_au AFTER UPDATE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description, tags)
  VALUES('delete', old.id, old.title, old.description, old.tags);
  INSERT INTO listings_fts(rowid, title, description, tags)
  VALUES (new.id, new.title, new.description, new.tags);
END;
CREATE TRIGGER listings_ad AFTER DELETE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description, tags)
  VALUES('delete', old.id, old.title, old.description, old.tags);
END;
