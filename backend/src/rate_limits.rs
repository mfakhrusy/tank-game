use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

pub(crate) struct Bucket {
    tokens: f64,
    updated: Instant,
    capacity: f64,
    rate: f64,
}
impl Bucket {
    pub(crate) fn new(capacity: f64, rate: f64, now: Instant) -> Self {
        Self {
            tokens: capacity,
            updated: now,
            capacity,
            rate,
        }
    }
    pub(crate) fn take(&mut self, amount: f64, now: Instant) -> bool {
        self.tokens = (self.tokens
            + now.saturating_duration_since(self.updated).as_secs_f64() * self.rate)
            .min(self.capacity);
        self.updated = now;
        if self.tokens < amount {
            return false;
        }
        self.tokens -= amount;
        true
    }
}
#[derive(Default)]
pub(crate) struct HttpLimits {
    buckets: HashMap<String, Bucket>,
}
impl HttpLimits {
    pub(crate) fn allow(&mut self, key: String, per_minute: u32, now: Instant) -> bool {
        if self.buckets.len() >= 4096 {
            self.buckets
                .retain(|_, b| now.saturating_duration_since(b.updated) < Duration::from_secs(120));
            if self.buckets.len() >= 4096 && !self.buckets.contains_key(&key) {
                return false;
            }
        }
        self.buckets
            .entry(key)
            .or_insert_with(|| Bucket::new(per_minute as f64, per_minute as f64 / 60.0, now))
            .take(1.0, now)
    }
}
pub(crate) struct SocketLimits {
    messages: Bucket,
    bytes: Bucket,
    upgrades: Bucket,
}
impl SocketLimits {
    pub(crate) fn new(now: Instant) -> Self {
        Self {
            messages: Bucket::new(60.0, 30.0, now),
            bytes: Bucket::new(131072.0, 65536.0, now),
            upgrades: Bucket::new(10.0, 5.0, now),
        }
    }
    pub(crate) fn message(&mut self, bytes: usize, now: Instant) -> bool {
        self.messages.take(1.0, now) && self.bytes.take(bytes as f64, now)
    }
    pub(crate) fn upgrade(&mut self, now: Instant) -> bool {
        self.upgrades.take(1.0, now)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_refill_and_keys_are_independent() {
        let now = Instant::now();
        let mut limits = HttpLimits::default();
        for _ in 0..10 {
            assert!(limits.allow("one".into(), 10, now));
        }
        assert!(!limits.allow("one".into(), 10, now));
        assert!(limits.allow("two".into(), 10, now));
        assert!(limits.allow("one".into(), 10, now + Duration::from_secs(6)));
    }
    #[test]
    fn normal_game_updates_fit_but_message_and_byte_floods_do_not() {
        let now = Instant::now();
        let mut limits = SocketLimits::new(now);
        for i in 0..1000 {
            assert!(limits.message(200, now + Duration::from_millis(i * 67)));
        }
        let mut flood = SocketLimits::new(now);
        for _ in 0..60 {
            assert!(flood.message(1, now));
        }
        assert!(!flood.message(1, now));
        let mut huge = SocketLimits::new(now);
        assert!(!huge.message(131073, now));
    }
}
