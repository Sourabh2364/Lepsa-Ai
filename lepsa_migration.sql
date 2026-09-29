-- LEPSA AI data migration -> Turso
-- Generated for import via: turso db shell <db-name> < lepsa_migration.sql

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fact TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chatmsg_conv ON chat_messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_documents_conv ON documents(conversation_id);

INSERT INTO users (id, name, email, password, created_at, credits, tier) VALUES (1, 'Sourabh Kumar', 'sb296113@gmail.com', '$2y$10$hCdT/ruTWbHNGYLpiIEVpOFyNduSJMsYeWdgJ2qSMwOBe0kgER6wi', '2026-09-17 13:43:32', 9, 'free');

INSERT INTO memories (id, user_id, fact, created_at) VALUES (1, 1, 'The user''s name is Saurav.', '2026-09-19 14:26:23');

INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (8, 1, 'What isy name', '2026-09-20 05:34:35', '2026-09-20 06:35:45');
INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (9, 1, 'हेलो', '2026-09-21 02:07:50', '2026-09-21 02:09:03');

INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (20, 8, 'user', 'What isy name', '2026-09-20 05:34:35');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (21, 8, 'assistant', 'Your name is Saurav.', '2026-09-20 05:34:37');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (22, 8, 'user', 'Give answer', '2026-09-20 05:37:36');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (23, 8, 'assistant', 'To find the mean of the given frequency distribution, we follow these steps:

1.  **Calculate the Mid-point (xᵢ) for each class interval:**
    *   For 0-10: (0 + 10) / 2 = 5
    *   For 10-20: (10 + 20) / 2 = 15
    *   For 20-30: (20 + 30) / 2 = 25
    *   For 30-40: (30 + 40) / 2 = 35
    *   For 40-50: (40 + 50) / 2 = 45

2.  **Multiply the Mid-point (xᵢ) by its corresponding frequency (fᵢ):**
    *   For 0-10: 5 * 7 = 35
    *   For 10-20: 15 * 10 = 150
    *   For 20-30: 25 * 15 = 375
    *   For 30-40: 35 * 8 = 280
    *   For 40-50: 45 * 10 = 450

3.  **Sum the products (Σfᵢxᵢ):**
    Σfᵢxᵢ = 35 + 150 + 375 + 280 + 450 = 1290

4.  **Sum the frequencies (Σfᵢ):**
    Σfᵢ = 7 + 10 + 15 + 8 + 10 = 50

5.  **Calculate the Mean (x̄) using the formula: x̄ = Σfᵢxᵢ / Σfᵢ**
    x̄ = 1290 / 50 = 25.8

Comparing this result with the given options:
(a) 25.8
(b) 24.8
(c) 25.9
(d) 24.9

The calculated mean is 25.8.

Therefore, the correct answer is **(a) 25.8**.', '2026-09-20 05:37:47');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (24, 8, 'user', 'हेलो अलेक्सा', '2026-09-20 06:34:16');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (25, 8, 'assistant', 'नमस्ते! मैं लेप्सा एआई हूँ। बताइए, मैं आपकी क्या सहायता कर सकती हूँ?', '2026-09-20 06:34:19');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (26, 8, 'user', 'How to make my face more attractive and beautiful', '2026-09-20 06:35:45');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (27, 8, 'assistant', 'Saurav, you''re asking about enhancing your facial appearance to be more attractive and beautiful. This is a common desire, and there are many ways to approach it, focusing on both physical well-being and personal style.

Based on the image you shared, here are some general, professional suggestions that people often consider for improving their facial aesthetics:

1.  **Skincare Routine:**
    *   **Cleanse:** Use a gentle cleanser twice a day to remove dirt and oil.
    *   **Moisturize:** Keep your skin hydrated with a suitable moisturizer for your skin type.
    *   **Sun Protection:** Always use sunscreen, even on cloudy days, to protect against sun damage and premature aging.
    *   **Address Specific Concerns:** If you have concerns like acne, dark spots, or uneven tone, consider products with ingredients like salicylic acid, niacinamide, or vitamin C, or consult a dermatologist for personalized advice.

2.  **Hair Care and Styling:**
    *   **Maintain Healthy Hair:** Regular washing, conditioning, and occasional deep conditioning treatments can keep your hair looking its best.
    *   **Find a Flattering Hairstyle:** Your current hairstyle has a good volume. Experiment with different cuts and styles that complement your face shape. A good barber or stylist can offer professional recommendations.

3.  **Grooming:**
    *   **Eyebrows:** Well-groomed eyebrows can frame your face and enhance your eyes. You can get them shaped professionally or maintain them yourself.
    *   **Facial Hair:** If you prefer facial hair, ensure it''s neatly trimmed and maintained. If not, a clean shave or regular trimming can create a polished look.

4.  **Overall Health and Lifestyle:**
    *   **Diet:** A balanced diet rich in fruits, vegetables, and lean proteins can contribute to healthy skin and hair.
    *   **Hydration:** Drinking plenty of water is crucial for skin health.
    *   **Sleep:** Adequate sleep helps reduce dark circles and promotes a refreshed appearance.
    *   **Stress Management:** High stress levels can impact skin health, so finding ways to manage stress is beneficial.
    *   **Exercise:** Regular physical activity can improve circulation, which contributes to a healthy glow.

5.  **Posture and Expression:**
    *   **Good Posture:** Standing and sitting upright can make a significant difference in your overall presentation.
    *   **Confident Expression:** A genuine smile and confident demeanor are universally attractive.

Remember, true attractiveness comes from a combination of inner confidence and external care. Focus on what makes you feel good and confident, and that will naturally shine through.

If you have specific aspects you''d like to improve, feel free to elaborate, and I can provide more targeted suggestions.', '2026-09-20 06:35:59');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (28, 9, 'user', 'हेलो', '2026-09-21 02:07:50');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (29, 9, 'assistant', 'नमस्ते, सौरभ। मैं आपकी क्या सहायता कर सकता हूँ?', '2026-09-21 02:07:54');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (30, 9, 'user', 'हेलो', '2026-09-21 02:09:03');
INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (31, 9, 'assistant', 'नमस्ते, सौरभ। मैं आपकी क्या सहायता कर सकता हूँ?', '2026-09-21 02:09:06');

