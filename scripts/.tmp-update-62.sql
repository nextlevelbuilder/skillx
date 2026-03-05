UPDATE skills SET content = '---
name: email-gateway
description: |
  Multi-provider email sending for Cloudflare Workers and Node.js applications.

  Build transactional email systems with Resend (React Email support), SendGrid (enterprise scale),
  Mailgun (developer webhooks), or SMTP2Go (reliable relay). Includes template patterns, webhook
  verification, attachment handling, and error recovery. Use when sending emails via API, handling
  bounces/complaints, or migrating between providers.
user-invocable: true

metadata:
  keywords:
    - resend
    - sendgrid
    - mailgun
    - smtp2go
    - email api
    - transactional email
    - react email
    - email webhooks
    - bounce handling
    - email templates
    - smtp relay
license: MIT
---

# Email Gateway (Multi-Provider)

**Status**: Production Ready ✅
**Last Updated**: 2026-01-10
**Providers**: Resend, SendGrid, Mailgun, SMTP2Go

---

## Quick Start

Choose your provider based on needs:

| Provider | Best For | Key Feature | Free Tier |
|----------|----------|-------------|-----------|
| **Resend** | Modern apps, React Email | JSX templates | 100/day, 3k/month |
| **SendGrid** | Enterprise scale | Dynamic templates | 100/day forever |
| **Mailgun** | Developer webhooks | Event tracking | 100/day |
| **SMTP2Go** | Reliable relay, AU | Simple API | 1k/month trial |

### Resend (Recommended for New Projects)

```typescript
const response = await fetch(''https://api.resend.com/emails'', {
  method: ''POST'',
  headers: {
    ''Authorization'': `Bearer ${env.RESEND_API_KEY}`,
    ''Content-Type'': ''application/json'',
  },
  body: JSON.stringify({
    from: ''noreply@yourdomain.com'',
    to: ''user@example.com'',
    subject: ''Welcome!'',
    html: ''<h1>Hello World</h1>'',
  }),
});

const data = await response.json();
// { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
```

### SendGrid (Enterprise)

```typescript
const response = await fetch(''https://api.sendgrid.com/v3/mail/send'', {
  method: ''POST'',
  headers: {
    ''Authorization'': `Bearer ${env.SENDGRID_API_KEY}`,
    ''Content-Type'': ''application/json'',
  },
  body: JSON.stringify({
    personalizations: [{
      to: [{ email: ''user@example.com'' }],
    }],
    from: { email: ''noreply@yourdomain.com'' },
    subject: ''Welcome!'',
    content: [{
      type: ''text/html'',
      value: ''<h1>Hello World</h1>'',
    }],
  }),
});

// Returns 202 on success (no body)
```

### Mailgun

```typescript
const formData = new FormData();
formData.append(''from'', ''noreply@yourdomain.com'');
formData.append(''to'', ''user@example.com'');
formData.append(''subject'', ''Welcome!'');
formData.append(''html'', ''<h1>Hello World</h1>'');

const response = await fetch(
  `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`,
  {
    method: ''POST'',
    headers: {
      ''Authorization'': `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
    },
    body: formData,
  }
);

const data = await response.json();
// { id: "<20111114174239.25659.5817@samples.mailgun.org>", message: "Queued. Thank you." }
```

### SMTP2Go

```typescript
const response = await fetch(''https://api.smtp2go.com/v3/email/send'', {
  method: ''POST'',
  headers: {
    ''Content-Type'': ''application/json'',
  },
  body: JSON.stringify({
    api_key: env.SMTP2GO_API_KEY,
    to: [''<user@example.com>''],
    sender: ''noreply@yourdomain.com'',
    subject: ''Welcome!'',
    html_body: ''<h1>Hello World</h1>'',
  }),
});

const data = await response.json();
// { data: { succeeded: 1, failed: 0, email_id: "..." } }
```

---

## Provider Comparison

### Features

| Feature | Resend | SendGrid | Mailgun | SMTP2Go |
|---------|--------|----------|---------|---------|
| **React Email** | ✅ Native | ❌ | ❌ | ❌ |
| **Dynamic Templates** | ✅ | ✅ | ✅ | ✅ |
| **Batch Sending** | 50/request | 1000/request | 1000/request | 100/request |
| **Webhooks** | ✅ | ✅ | ✅ | ✅ |
| **SMTP** | ✅ | ✅ | ✅ | ✅ Primary |
| **IP Warmup** | Managed | Manual | Manual | Managed |
| **Dedicated IPs** | Enterprise | $90+/mo | $80+/mo | Custom |
| **Analytics** | Basic | Advanced | Advanced | Good |
| **A/B Testing** | ❌ | ✅ | ✅ | ❌ |

### Rate Limits (Free Tier)

| Provider | Daily | Monthly | Overage Cost |
|----------|-------|---------|--------------|
| **Resend** | 100 | 3,000 | $1/1k |
| **SendGrid** | 100 | Forever | $15 for 10k |
| **Mailgun** | 100 | Forever | $15 for 10k |
| **SMTP2Go** | ~33 | 1,000 trial | $10 for 10k |

### API Limits

| Provider | Requests/sec | Burst | Retry After Header |
|----------|--------------|-------|-------------------|
| **Resend** | 10 | Yes | ✅ |
| **SendGrid** | 600 | Yes | ✅ |
| **Mailgun** | Varies | Yes | ✅ |
| **SMTP2Go** | 10 | Limited | ✅ |

### Message Limits

| Provider | Max Size | Attachments | Max Recipients |
|----------|----------|-------------|----------------|
| **Resend** | 40 MB | 40 MB total | 50/request |
| **SendGrid** | 20 MB | 20 MB total | 1000/request |
| **Mailgun** | 25 MB | 25 MB total | 1000/request |
| **SMTP2Go** | 50 MB | 50 MB total | 100/request |

---

## Configuration

### Environment Variables

```bash
# Resend
RESEND_API_KEY=re_xxxxxxxxx

# SendGrid
SENDGRID_API_KEY=SG.xxxxxxxxx

# Mailgun
MAILGUN_API_KEY=xxxxxxxx-xxxxxxxx-xxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_REGION=us  # or eu

# SMTP2Go
SMTP2GO_API_KEY=api-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Wrangler Secrets (Cloudflare Workers)

```bash
# Set secrets
echo "re_xxxxxxxxx" | npx wrangler secret put RESEND_API_KEY
echo "SG.xxxxxxxxx" | npx wrangler secret put SENDGRID_API_KEY
echo "xxxxxxxx-xxxxxxxx-xxxxxxxx" | npx wrangler secret put MAILGUN_API_KEY
echo "api-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | npx wrangler secret put SMTP2GO_API_KEY

# Deploy to activate
npx wrangler deploy
```

### TypeScript Types

```typescript
// Resend
interface ResendEmail {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: string; // base64
  }>;
  tags?: Record<string, string>;
  scheduledAt?: string; // ISO 8601
}

interface ResendResponse {
  id: string;
}

// SendGrid
interface SendGridEmail {
  personalizations: Array<{
    to: Array<{ email: string; name?: string }>;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    subject?: string;
    dynamic_template_data?: Record<string, unknown>;
  }>;
  from: { email: string; name?: string };
  subject?: string;
  content?: Array<{
    type: ''text/plain'' | ''text/html'';
    value: string;
  }>;
  template_id?: string;
  attachments?: Array<{
    content: string; // base64
    filename: string;
    type?: string;
    disposition?: ''inline'' | ''attachment'';
  }>;
}

// Mailgun
interface MailgunEmail {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  ''h:Reply-To''?: string;
  template?: string;
  ''h:X-Mailgun-Variables''?: string; // JSON
  attachment?: File | File[];
  inline?: File | File[];
  ''o:tag''?: string | string[];
  ''o:tracking''?: ''yes'' | ''no'';
  ''o:tracking-clicks''?: ''yes'' | ''no'' | ''htmlonly'';
  ''o:tracking-opens''?: ''yes'' | ''no'';
}

interface MailgunResponse {
  id: string;
  message: string;
}

// SMTP2Go
interface SMTP2GoEmail {
  api_key: string;
  to: string[];
  sender: string;
  subject: string;
  html_body?: string;
  text_body?: string;
  custom_headers?: Array<{
    header: string;
    value: string;
  }>;
  attachments?: Array<{
    filename: string;
    fileblob: string; // base64
    mimetype?: string;
  }>;
}

interface SMTP2GoResponse {
  data: {
    succeeded: number;
    failed: number;
    failures?: string[];
    email_id?: string;
  };
}
```

---

## Common Patterns

### 1. Transactional Emails

**Password Reset**:

```typescript
// templates/password-reset.ts
export async function sendPasswordReset(
  provider: ''resend'' | ''sendgrid'' | ''mailgun'' | ''smtp2go'',
  to: string,
  resetToken: string,
  env: Env
): Promise<{ success: boolean; id?: string; error?: string }> {
  const resetUrl = `https://yourapp.com/reset-password?token=${resetToken}`;

  const html = `
    <h1>Reset Your Password</h1>
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>This link expires in 1 hour.</p>
  `;

  switch (provider) {
    case ''resend'':
      return sendViaResend(to, ''Reset Your Password'', html, env);
    case ''sendgrid'':
      return sendViaSendGrid(to, ''Reset Your Password'', html, env);
    case ''mailgun'':
      return sendViaMailgun(to, ''Reset Your Password'', html, env);
    case ''smtp2go'':
      return sendViaSMTP2Go(to, ''Reset Your Password'', html, env);
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  env: Env
): Promise<{ success: boolean; id?: string; error?: string }> {
  const response = await fetch(''https://api.resend.com/emails'', {
    method: ''POST'',
    headers: {
      ''Authorization'': `Bearer ${env.RESEND_API_KEY}`,
      ''Content-Type'': ''application/json'',
    },
    body: JSON.stringify({
      from: ''noreply@yourdomain.com'',
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  const data = await response.json();
  return { success: true, id: data.id };
}
```

### 2. Batch Sending

**Resend (max 50 recipients)**:

```typescript
async function sendBatchResend(
  recipients: string[],
  subject: string,
  html: string,
  env: Env
): Promise<Array<{ email: string; id?: string; error?: string }>> {
  const results: Array<{ email: string; id?: string; error?: string }> = [];

  // Chunk into groups of 50
  for (let i = 0; i < recipients.length; i += 50) {
    const chunk = recipients.slice(i, i + 50);

    const response = await fetch(''https://api.resend.com/emails'', {
      method: ''POST'',
      headers: {
        ''Authorization'': `Bearer ${env.RESEND_API_KEY}`,
        ''Content-Type'': ''application/json'',
      },
      body: JSON.stringify({
        from: ''noreply@yourdomain.com'',
        to: chunk,
        subject,
        html,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      chunk.forEach(email => results.push({ email, id: data.id }));
    } else {
      const error = await response.text();
      chunk.forEach(email => results.push({ email, error }));
    }
  }

  return results;
}
```

**SendGrid (max 1000 personalizations)**:

```typescript
async function sendBatchSendGrid(
  recipients: Array<{ email: string; name?: string; data?: Record<string, unknown> }>,
  templateId: string,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(''https://api.sendgrid.com/v3/mail/send'', {
    method: ''POST'',
    headers: {
      ''Authorization'': `Bearer ${env.SENDGRID_API_KEY}`,
      ''Content-Type'': ''application/json'',
    },
    body: JSON.stringify({
      personalizations: recipients.map(r => ({
        to: [{ email: r.email, name: r.name }],
        dynamic_template_data: r.data || {},
      })),
      from: { email: ''noreply@yourdomain.com'' },
      template_id: templateId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  return { success: true };
}
```

### 3. React Email Templates (Resend Only)

**Install React Email**:

```bash
npm install react-email @react-email/components
```

**Create Template**:

```tsx
// emails/welcome.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Button,
} from ''@react-email/components'';

interface WelcomeEmailProps {
  name: string;
  confirmUrl: string;
}

export default function WelcomeEmail({ name, confirmUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: ''Arial, sans-serif'' }}>
        <Container>
          <Heading>Welcome, {name}!</Heading>
          <Text>Thanks for signing up. Please confirm your email address:</Text>
          <Button href={confirmUrl} style={{ background: ''#000'', color: ''#fff'' }}>
            Confirm Email
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

**Send via Resend SDK (Node.js)**:

```typescript
import { Resend } from ''resend'';
import WelcomeEmail from ''./emails/welcome'';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: ''noreply@yourdomain.com'',
  to: ''user@example.com'',
  subject: ''Welcome!'',
  react: WelcomeEmail({ name: ''Alice'', confirmUrl: ''https://...'' }),
});
```

**Send via Workers (render to HTML first)**:

```typescript
import { render } from ''@react-email/render'';
import WelcomeEmail from ''./emails/welcome'';

const html = render(WelcomeEmail({ name: ''Alice'', confirmUrl: ''https://...'' }));

await fetch(''https://api.resend.com/emails'', {
  method: ''POST'',
  headers: {
    ''Authorization'': `Bearer ${env.RESEND_API_KEY}`,
    ''Content-Type'': ''application/json'',
  },
  body: JSON.stringify({
    from: ''noreply@yourdomain.com'',
    to: ''user@example.com'',
    subject: ''Welcome!'',
    html,
  }),
});
```

### 4. Dynamic Templates

**SendGrid**:

```typescript
// 1. Create template in SendGrid dashboard with handlebars
// Subject: Welcome {{name}}!
// Body: <h1>Hi {{name}}</h1><p>Your code: {{confirmationCode}}</p>

// 2. Send with template ID
const response = await fetch(''https://api.sendgrid.com/v3/mail/send'', {
  method: ''POST'',
  headers: {
    ''Authorization'': `Bearer ${env.SENDGRID_API_KEY}`,
    ''Content-Type'': ''application/json'',
  },
  body: JSON.stringify({
    personalizations: [{
      to: [{ email: ''user@example.com'' }],
      dynamic_template_data: {
        name: ''Alice'',
        confirmationCode: ''ABC123'',
      },
    }],
    from: { email: ''noreply@yourdomain.com'' },
    template_id: ''d-xxxxxxxxxxxxxxxxxxxxxxxx'',
  }),
});
```

**Mailgun**:

```typescript
// 1. Create template in Mailgun dashboard or via API
// Use {{name}} and {{confirmationCode}} variables

// 2. Send with template name
const formData = new FormData();
formData.append(''from'', ''noreply@yourdomain.com'');
formData.append(''to'', ''user@example.com'');
formData.append(''subject'', ''Welcome'');
formData.append(''template'', ''welcome-template'');
formData.append(''h:X-Mailgun-Variables'', JSON.stringify({
  name: ''Alice'',
  confirmationCode: ''ABC123'',
}));

const response = await fetch(
  `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`,
  {
    method: ''POST'',
    headers: {
      ''Authorization'': `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
    },
    body: formData,
  }
);
```

### 5. Attachments

**Resend**:

```typescript
const fileBuffer = await file.arrayBuffer();
const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

await fetch(''https://api.resend.com/emails'', {
  method: ''POST'',
  headers: {
    ''Authorization'': `Bearer ${env.RESEND

<!-- truncated -->' WHERE slug = 'neversight-email-gateway';
UPDATE skills SET content = '---
name: combine-migration
description: Migrating from Combine to Swift Observation framework and modern async/await patterns. Covers Publisher to AsyncSequence conversion, ObservableObject to @Observable migration, bridging patterns, and reactive code modernization. Use when user asks about Combine migration, ObservableObject to Observable, Publisher to AsyncSequence, or modernizing reactive code.
allowed-tools: Bash, Read, Write, Edit
---

# Combine to Observation Migration

Guide for migrating from Combine framework to modern Swift Observation and async/await patterns.

## Prerequisites

- iOS 17+ / macOS 14+ for Observation framework
- Swift 5.9+

---

## Migration Overview

```
┌─────────────────────────────────────────────────────────────┐
│               COMBINE → MODERN SWIFT                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ObservableObject  →  @Observable                           │
│  @Published        →  Regular properties                    │
│  @ObservedObject   →  Direct reference                      │
│  @StateObject      →  @State                                │
│  @EnvironmentObject→  @Environment                          │
│  Publisher         →  AsyncSequence                          │
│  sink/assign       →  for await / async let                 │
│  Cancellable       →  Task cancellation                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ObservableObject to @Observable

### Before: Combine-based ViewModel

```swift
import Combine
import SwiftUI

class UserViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var email: String = ""
    @Published var isLoading: Bool = false
    @Published private(set) var error: Error?

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Debounce name changes for validation
        $name
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] name in
                self?.validateName(name)
            }
            .store(in: &cancellables)
    }

    func save() {
        isLoading = true
        // Save logic
    }

    private func validateName(_ name: String) {
        // Validation logic
    }
}

// SwiftUI usage
struct UserView: View {
    @StateObject private var viewModel = UserViewModel()

    var body: some View {
        Form {
            TextField("Name", text: $viewModel.name)
            TextField("Email", text: $viewModel.email)

            if viewModel.isLoading {
                ProgressView()
            }

            Button("Save") {
                viewModel.save()
            }
        }
    }
}
```

### After: Modern @Observable

```swift
import Observation
import SwiftUI

@Observable
class UserViewModel {
    var name: String = ""
    var email: String = ""
    var isLoading: Bool = false
    private(set) var error: Error?

    // Debouncing with Task
    private var validationTask: Task<Void, Never>?

    var nameDidChange: Void {
        // Called when name changes
        validationTask?.cancel()
        validationTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await validateName(name)
        }
    }

    func save() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await saveToServer()
        } catch {
            self.error = error
        }
    }

    private func validateName(_ name: String) async {
        // Async validation
    }

    private func saveToServer() async throws {
        // Network call
    }
}

// SwiftUI usage - simpler!
struct UserView: View {
    @State private var viewModel = UserViewModel()

    var body: some View {
        Form {
            TextField("Name", text: $viewModel.name)
                .onChange(of: viewModel.name) { _, _ in
                    _ = viewModel.nameDidChange
                }

            TextField("Email", text: $viewModel.email)

            if viewModel.isLoading {
                ProgressView()
            }

            Button("Save") {
                Task { await viewModel.save() }
            }
        }
    }
}
```

### Key Differences

| Combine | Observation |
|---------|-------------|
| `class ViewModel: ObservableObject` | `@Observable class ViewModel` |
| `@Published var` | `var` (automatic) |
| `@StateObject` | `@State` |
| `@ObservedObject` | Direct reference |
| `@EnvironmentObject` | `@Environment` |
| `objectWillChange.send()` | Automatic |

---

## Publisher to AsyncSequence

### Converting Publishers to AsyncSequence

```swift
import Combine

extension Publisher where Failure == Never {
    /// Convert any non-failing Publisher to AsyncSequence
    var values: AsyncStream<Output> {
        AsyncStream { continuation in
            let cancellable = self.sink { value in
                continuation.yield(value)
            }

            continuation.onTermination = { _ in
                cancellable.cancel()
            }
        }
    }
}

extension Publisher {
    /// Convert any Publisher to throwing AsyncSequence
    var throwingValues: AsyncThrowingStream<Output, Error> {
        AsyncThrowingStream { continuation in
            let cancellable = self.sink(
                receiveCompletion: { completion in
                    switch completion {
                    case .finished:
                        continuation.finish()
                    case .failure(let error):
                        continuation.finish(throwing: error)
                    }
                },
                receiveValue: { value in
                    continuation.yield(value)
                }
            )

            continuation.onTermination = { _ in
                cancellable.cancel()
            }
        }
    }
}
```

### Before: Combine Pipeline

```swift
class DataService {
    private var cancellables = Set<AnyCancellable>()

    func startMonitoring() {
        NotificationCenter.default
            .publisher(for: .NSManagedObjectContextDidSave)
            .debounce(for: .milliseconds(500), scheduler: RunLoop.main)
            .sink { [weak self] notification in
                self?.handleContextSave(notification)
            }
            .store(in: &cancellables)
    }

    private func handleContextSave(_ notification: Notification) {
        // Handle save
    }
}
```

### After: AsyncSequence

```swift
class DataService {
    private var monitoringTask: Task<Void, Never>?

    func startMonitoring() {
        monitoringTask = Task {
            // Using new iOS 17+ async notification API
            for await notification in NotificationCenter.default.notifications(named: .NSManagedObjectContextDidSave) {
                // Built-in debouncing with Task.sleep
                try? await Task.sleep(for: .milliseconds(500))
                guard !Task.isCancelled else { return }

                await handleContextSave(notification)
            }
        }
    }

    func stopMonitoring() {
        monitoringTask?.cancel()
        monitoringTask = nil
    }

    private func handleContextSave(_ notification: Notification) async {
        // Handle save
    }
}
```

### Custom AsyncSequence for Events

```swift
// Modern event stream
struct LocationUpdates: AsyncSequence {
    typealias Element = CLLocation

    struct AsyncIterator: AsyncIteratorProtocol {
        let manager: CLLocationManager
        var continuation: AsyncStream<CLLocation>.Continuation?

        mutating func next() async -> CLLocation? {
            // Implementation
            return nil
        }
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(manager: CLLocationManager())
    }
}

// Usage
func trackLocation() async {
    for await location in LocationUpdates() {
        print("New location: \(location)")
    }
}
```

---

## Common Patterns Migration

### Debouncing

```swift
// BEFORE: Combine
$searchText
    .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
    .sink { [weak self] text in
        self?.search(text)
    }
    .store(in: &cancellables)

// AFTER: Task-based debounce
@Observable
class SearchViewModel {
    var searchText: String = "" {
        didSet { debouncedSearch() }
    }

    private var searchTask: Task<Void, Never>?

    private func debouncedSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await performSearch(searchText)
        }
    }

    private func performSearch(_ query: String) async {
        // Search implementation
    }
}
```

### Throttling

```swift
// BEFORE: Combine
$value
    .throttle(for: .seconds(1), scheduler: RunLoop.main, latest: true)
    .sink { value in
        self.process(value)
    }
    .store(in: &cancellables)

// AFTER: Task-based throttle
actor Throttler {
    private var lastExecution: Date?
    private let interval: Duration

    init(interval: Duration) {
        self.interval = interval
    }

    func throttle(_ action: @escaping () async -> Void) async {
        let now = Date()

        if let last = lastExecution {
            let elapsed = now.timeIntervalSince(last)
            if elapsed < interval.timeInterval {
                return  // Skip this call
            }
        }

        lastExecution = now
        await action()
    }
}

extension Duration {
    var timeInterval: TimeInterval {
        let (seconds, attoseconds) = self.components
        return Double(seconds) + Double(attoseconds) / 1e18
    }
}
```

### CombineLatest / Merge

```swift
// BEFORE: Combine
Publishers.CombineLatest($firstName, $lastName)
    .map { "\($0) \($1)" }
    .sink { fullName in
        self.fullName = fullName
    }
    .store(in: &cancellables)

// AFTER: Computed property (simplest)
@Observable
class PersonViewModel {
    var firstName: String = ""
    var lastName: String = ""

    var fullName: String {
        "\(firstName) \(lastName)"
    }
}

// AFTER: AsyncSequence merge (for streams)
func mergeStreams() async {
    async let stream1 = processStream1()
    async let stream2 = processStream2()

    // Process both concurrently
    let results = await (stream1, stream2)
}

// Task group for dynamic merging
func mergeMultiple<T>(_ sequences: [AsyncStream<T>]) -> AsyncStream<T> {
    AsyncStream { continuation in
        Task {
            await withTaskGroup(of: Void.self) { group in
                for sequence in sequences {
                    group.addTask {
                        for await value in sequence {
                            continuation.yield(value)
                        }
                    }
                }
            }
            continuation.finish()
        }
    }
}
```

### Retry Logic

```swift
// BEFORE: Combine
urlSession.dataTaskPublisher(for: url)
    .retry(3)
    .sink(
        receiveCompletion: { _ in },
        receiveValue: { data, response in }
    )
    .store(in: &cancellables)

// AFTER: async/await retry
func fetchWithRetry(url: URL, maxAttempts: Int = 3) async throws -> Data {
    var lastError: Error?

    for attempt in 1...maxAttempts {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return data
        } catch {
            lastError = error

            if attempt < maxAttempts {
                // Exponential backoff
                let delay = Duration.seconds(pow(2, Double(attempt - 1)))
                try await Task.sleep(for: delay)
            }
        }
    }

    throw lastError ?? URLError(.unknown)
}
```

### Error Handling

```swift
// BEFORE: Combine
fetchPublisher()
    .catch { error -> AnyPublisher<Data, Never> in
        return Just(Data()).eraseToAnyPublisher()
    }
    .sink { data in
        self.process(data)
    }
    .store(in: &cancellables)

// AFTER: async/await
func fetchWithFallback() async -> Data {
    do {
        return try await fetchData()
    } catch {
        // Log error
        print("Fetch failed: \(error), using fallback")
        return Data()  // Fallback
    }
}

// Or with Result type
func fetchResult() async -> Result<Data, Error> {
    do {
        let data = try await fetchData()
        return .success(data)
    } catch {
        return .failure(error)
    }
}
```

---

## Bridging Combine and Async/Await

### When You Need Both

Sometimes you need to bridge between systems during migration:

```swift
import Combine

// Combine Publisher from async function
extension Publisher {
    static func fromAsync<T>(_ operation: @escaping () async throws -> T) -> AnyPublisher<T, Error> {
        Deferred {
            Future { promise in
                Task {
                    do {
                        let result = try await operation()
                        promise(.success(result))
                    } catch {
                        promise(.failure(error))
                    }
                }
            }
        }
        .eraseToAnyPublisher()
    }
}

// Usage
let publisher = Publisher.fromAsync {
    try await fetchUserData()
}

// Async function from Combine Publisher
extension Publisher {
    func firstValue() async throws -> Output {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?

            cancellable = self.first().sink(
                receiveCompletion: { completion in
                    switch completion {
                    case .finished:
                        break
                    case .failure(let error):
                        continuation.resume(throwing: error)
                    }
                    cancellable?.cancel()
                },
                receiveValue: { value in
                    continuation.resume(returning: value)
                }
            )
        }
    }
}

// Usage
let user = try await userPublisher.firstValue()
```

### Gradual Migration Strategy

```swift
// Phase 1: Keep Combine internally, expose async API
class LegacyService {
    private var cancellables = Set<AnyCancellable>()

    // Legacy Combine implementation
    private func fetchUserCombine() -> AnyPublisher<User, Error> {
        // Existing Combine code
        URLSession.shared.dataTaskPublisher(for: userURL)
            .map(\.data)
            .decode(type: User.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }

    // New async wrapper
    func fetchUser() async throws -> User {
        try await fetchUserCombine().firstValue()
    }
}

// Phase 2: Rewrite internals to async
class ModernService {
    func fetchUser() async throws -> User {
        let (data, _) = 

<!-- truncated -->' WHERE slug = 'neversight-combine-migration';
UPDATE skills SET content = '---
name: react-hook-form
description: React Hook Form performance optimization for client-side form validation using useForm, useWatch, useController, and useFieldArray. This skill should be used when building client-side controlled forms with React Hook Form library. This skill does NOT cover React 19 Server Actions, useActionState, or server-side form handling (use react-19 skill for those).
---

# React Hook Form Best Practices

Comprehensive performance optimization guide for React Hook Form applications. Contains 41 rules across 8 categories, prioritized by impact to guide form development, automated refactoring, and code generation.

## When to Apply

Reference these guidelines when:
- Writing new forms with React Hook Form
- Configuring useForm options (mode, defaultValues, validation)
- Subscribing to form values with watch/useWatch
- Integrating controlled UI components (MUI, shadcn, Ant Design)
- Managing dynamic field arrays with useFieldArray
- Reviewing forms for performance issues

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Form Configuration | CRITICAL | `formcfg-` |
| 2 | Field Subscription | CRITICAL | `sub-` |
| 3 | Controlled Components | HIGH | `ctrl-` |
| 4 | Validation Patterns | HIGH | `valid-` |
| 5 | Field Arrays | MEDIUM-HIGH | `array-` |
| 6 | State Management | MEDIUM | `formstate-` |
| 7 | Integration Patterns | MEDIUM | `integ-` |
| 8 | Advanced Patterns | LOW | `adv-` |

## Quick Reference

### 1. Form Configuration (CRITICAL)

- `formcfg-validation-mode` - Use onSubmit mode for optimal performance
- `formcfg-revalidate-mode` - Set reValidateMode to onBlur for post-submit performance
- `formcfg-default-values` - Always provide defaultValues for form initialization
- `formcfg-async-default-values` - Use async defaultValues for server data
- `formcfg-should-unregister` - Enable shouldUnregister for dynamic form memory efficiency
- `formcfg-useeffect-dependency` - Avoid useForm return object in useEffect dependencies

### 2. Field Subscription (CRITICAL)

- `sub-usewatch-over-watch` - Use useWatch instead of watch for isolated re-renders
- `sub-watch-specific-fields` - Watch specific fields instead of entire form
- `sub-usewatch-with-getvalues` - Combine useWatch with getValues for timing safety
- `sub-deep-subscription` - Subscribe deep in component tree where data is needed
- `sub-avoid-watch-in-render` - Avoid calling watch() in render for one-time reads
- `sub-usewatch-default-value` - Provide defaultValue to useWatch for initial render
- `sub-useformcontext-sparingly` - Use useFormContext sparingly for deep nesting

### 3. Controlled Components (HIGH)

- `ctrl-usecontroller-isolation` - Use useController for re-render isolation
- `ctrl-avoid-double-registration` - Avoid double registration with useController
- `ctrl-controller-field-props` - Wire Controller field props correctly for UI libraries
- `ctrl-single-usecontroller-per-component` - Use single useController per component
- `ctrl-local-state-combination` - Combine local state with useController for UI-only state

### 4. Validation Patterns (HIGH)

- `valid-resolver-caching` - Define schema outside component for resolver caching
- `valid-dynamic-schema-factory` - Use schema factory for dynamic validation
- `valid-error-message-strategy` - Access errors via optional chaining or lodash get
- `valid-inline-vs-resolver` - Prefer resolver over inline validation for complex rules
- `valid-delay-error` - Use delayError to debounce rapid error display
- `valid-native-validation` - Consider native validation for simple forms

### 5. Field Arrays (MEDIUM-HIGH)

- `array-use-field-id-as-key` - Use field.id as key in useFieldArray maps
- `array-complete-default-objects` - Provide complete default objects for field array operations
- `array-separate-crud-operations` - Separate sequential field array operations
- `array-unique-fieldarray-per-name` - Use single useFieldArray instance per field name
- `array-virtualization-formprovider` - Use FormProvider for virtualized field arrays

### 6. State Management (MEDIUM)

- `formstate-destructure-formstate` - Destructure formState properties before render
- `formstate-useformstate-isolation` - Use useFormState for isolated state subscriptions
- `formstate-getfieldstate-for-single-field` - Use getFieldState for single field state access
- `formstate-subscribe-to-specific-fields` - Subscribe to specific field names in useFormState
- `formstate-avoid-isvalid-with-onsubmit` - Avoid isValid with onSubmit mode for button state

### 7. Integration Patterns (MEDIUM)

- `integ-shadcn-form-import` - Verify shadcn Form component import source
- `integ-shadcn-select-wiring` - Wire shadcn Select with onValueChange instead of spread
- `integ-mui-controller-pattern` - Use Controller for Material-UI components
- `integ-value-transform` - Transform values at Controller level for type coercion

### 8. Advanced Patterns (LOW)

- `adv-formprovider-memo` - Wrap FormProvider children with React.memo
- `adv-devtools-performance` - Disable DevTools in production and during performance testing
- `adv-testing-wrapper` - Create test wrapper with QueryClient and AuthProvider

## How to Use

Read individual reference files for detailed explanations and code examples:

- [Section definitions](references/_sections.md) - Category structure and impact levels
- [Rule template](assets/templates/_template.md) - Template for adding new rules
- Reference files: `references/{prefix}-{slug}.md`

## Related Skills

- For schema validation with Zod resolver, see `zod` skill
- For React 19 server actions, see `react-19` skill
- For UI/UX form design, see `frontend-design` skill

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
' WHERE slug = 'neversight-react-hook-form';
UPDATE skills SET content = '---
name: vscode-webview-ui
description: Develop React applications for VS Code Webview surfaces. Use when working on the `webview-ui` package, creating features, components, or hooks for VS Code extensions. Includes project structure, coding guidelines, and testing instructions.
---

# VS Code Webview UI

## Overview

This skill assists in developing the React application that powers VS Code webview surfaces. It covers the `webview-ui` workspace, which is bundled with Vite and communicates with the extension host via the `bridge/vscode` helper.

## Project Structure

The `webview-ui` package follows this structure:

```
webview-ui/
├── src/
│   ├── components/        # Shared visual components reused across features
│   │   └── ui/            # shadcn/ui component library
│   ├── hooks/             # Shared React hooks
│   ├── features/
│   │   └── {feature}/
│   │       ├── index.tsx  # Feature entry component rendered from routing
│   │       ├── components/# Feature-specific components
│   │       └── hooks/     # Feature-specific hooks
│   ├── bridge/            # Messaging helpers for VS Code <-> webview
│   └── index.tsx          # Runtime router that mounts the selected feature
├── public/                # Static assets copied verbatim by Vite
├── vite.config.ts         # Vite build configuration
└── README.md
```

## Coding Guidelines

- **Shared Modules**: Prefer shared modules under `src/components` and `src/hooks` before introducing feature-local code.
- **Feature Boundaries**: Add feature-only utilities inside the nested `components/` or `hooks/` directories to keep boundaries clear.
- **Styling**: Keep styling in Tailwind-style utility classes (see `src/app.css` for base tokens) and avoid inline styles when reusable classes exist.
- **Messaging**: Exchange messages with the extension via `vscode.postMessage` and subscribe through `window.addEventListener(''message'', …)` inside React effects.
- **Configuration**: When adding new steering or config references, obtain paths through the shared `ConfigManager` utilities from the extension layer.

## Testing & Quality

- **Integration Tests**: Use Playwright or Cypress style integration tests if adding complex interactions (tests live under the repo-level `tests/`).
- **Pre-commit Checks**: Run `npm run lint` and `npm run build` before committing to ensure TypeScript and bundler checks pass.
' WHERE slug = 'neversight-vscode-webview-ui';
UPDATE skills SET content = '---
name: clerk-auth-expert
description: Expert in Clerk authentication for React Native/Expo apps. Handles user authentication, session management, protected routes, and integration with backend services.
---

# Clerk Authentication Expert

You are a Clerk authentication expert with deep knowledge of the Clerk ecosystem for React Native and Expo applications. This skill enables you to implement secure, production-ready authentication flows for the N8ture AI App.

## Core Responsibilities

- **Implement Clerk SDK** - Set up `@clerk/clerk-expo` with proper configuration
- **Authentication flows** - Build sign-in, sign-up, password reset, and social auth
- **Session management** - Handle user sessions, token refresh, and persistence
- **Protected routes** - Create authentication guards for navigation
- **User management** - Access and update user profiles and metadata
- **Backend integration** - Pass Clerk JWT tokens to Firebase Cloud Functions

## Quick Start

### Installation
```bash
npx expo install @clerk/clerk-expo expo-secure-store
```

### Basic Setup
```javascript
// App.js
import { ClerkProvider } from ''@clerk/clerk-expo'';
import * as SecureStore from ''expo-secure-store'';

const tokenCache = {
  async getToken(key) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key, value) {
    return SecureStore.setItemAsync(key, value);
  },
};

export default function App() {
  return (
    <ClerkProvider 
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <RootNavigator />
    </ClerkProvider>
  );
}
```

## Common Patterns

### Protected Route
```javascript
import { useAuth } from ''@clerk/clerk-expo'';

export function useProtectedRoute() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigation.navigate(''SignIn'');
    }
  }, [isSignedIn, isLoaded]);

  return { isSignedIn, isLoaded };
}
```

### User Profile Access
```javascript
import { useUser } from ''@clerk/clerk-expo'';

export function ProfileScreen() {
  const { user } = useUser();

  const updateProfile = async () => {
    await user.update({
      firstName: ''John'',
      lastName: ''Doe'',
    });
  };

  return (
    <View>
      <Text>Welcome, {user.firstName}!</Text>
      <Text>Email: {user.primaryEmailAddress.emailAddress}</Text>
    </View>
  );
}
```

### Backend Token Passing
```javascript
import { useAuth } from ''@clerk/clerk-expo'';

export function useAuthenticatedRequest() {
  const { getToken } = useAuth();

  const makeRequest = async (endpoint, data) => {
    const token = await getToken();
    
    const response = await fetch(endpoint, {
      method: ''POST'',
      headers: {
        ''Authorization'': `Bearer ${token}`,
        ''Content-Type'': ''application/json'',
      },
      body: JSON.stringify(data),
    });

    return response.json();
  };

  return { makeRequest };
}
```

## N8ture AI App Integration

### Trial Management
Store user trial count in Clerk user metadata:
```javascript
// Update trial count
await user.update({
  unsafeMetadata: {
    trialCount: 3,
    totalIdentifications: 0,
  },
});

// Check trial status
const trialCount = user.unsafeMetadata.trialCount || 0;
const canIdentify = user.publicMetadata.isPremium || trialCount > 0;
```

### Premium Subscription Status
```javascript
// Store subscription status
await user.update({
  publicMetadata: {
    isPremium: true,
    subscriptionId: ''sub_xxx'',
  },
});
```

## Best Practices

1. **Use token cache** - Always implement SecureStore token caching
2. **Handle loading states** - Check `isLoaded` before rendering auth-dependent UI
3. **Secure metadata** - Use `publicMetadata` for non-sensitive data, `privateMetadata` for sensitive data
4. **Error handling** - Implement proper error handling for auth failures
5. **Social auth** - Configure OAuth providers in Clerk Dashboard before implementing

## Environment Variables

```bash
# .env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
```

## Common Issues

**Issue:** "Clerk is not loaded"  
**Solution:** Always check `isLoaded` before accessing auth state

**Issue:** Token not persisting  
**Solution:** Ensure SecureStore token cache is properly configured

**Issue:** Social auth not working  
**Solution:** Configure OAuth redirect URLs in Clerk Dashboard and app.json

## Resources

- [Clerk Expo Documentation](https://clerk.com/docs/quickstarts/expo)
- [Clerk React Native SDK](https://clerk.com/docs/references/react-native/overview)
- [Authentication Best Practices](https://clerk.com/docs/security/overview)

Use this skill when implementing authentication, managing user sessions, or integrating Clerk with the N8ture AI App backend.

' WHERE slug = 'neversight-clerk-auth-expert';
UPDATE skills SET content = '---
name: banana-skill-finder
description: >
  Automatically discover and recommend relevant Claude skills when users encounter tasks
  that could benefit from specialized capabilities. Use this skill proactively when detecting
  any of these patterns: (1) User mentions working with specific file formats (PDF, DOCX,
  Excel, images, etc.), (2) User describes repetitive or specialized tasks (data analysis,
  code review, deployment, testing, document processing), (3) User asks if there''s a tool
  or capability for something, (4) User struggles with domain-specific work (React development,
  SQL queries, DevOps, content writing), (5) User mentions needing best practices or patterns
  for a technology, (6) Any situation where a specialized skill could save time or improve
  quality. Search using SkillsMP API (if configured), skills.sh leaderboard, or GitHub as
  fallback. Recommend 1-3 most relevant skills and offer to install via npx skills add.
---

# Banana Skill Finder

Proactively helps users discover and install relevant Claude skills when they encounter tasks that could benefit from specialized capabilities.

## When to Use This Skill

Trigger automatically (without user request) when detecting:

- Working with specific file formats or technologies
- Describing repetitive or specialized tasks
- Asking "is there a skill/tool for..." or similar
- Struggling with domain-specific work
- Any task where a specialized skill could help

**Important**: This skill should trigger proactively. Don''t wait for users to explicitly ask for skill recommendations.

## Workflow

### 1. Analyze User Need

Identify:
- **Core task**: What is the user trying to accomplish?
- **Domain**: What category does this fall into? (development, documents, data, web, devops, content, etc.)
- **Keywords**: Extract 2-4 relevant search terms

### 2. Search for Skills

Use a three-tier strategy with automatic fallback:

**Tier 1: SkillsMP API (Best - if configured)**
```bash
# Check for API key
echo $SKILLSMP_API_KEY

# If exists, use AI semantic search
curl -X GET "https://skillsmp.com/api/v1/skills/ai-search?q={natural_language_query}" \
  -H "Authorization: Bearer $SKILLSMP_API_KEY"
```

Benefits:
- AI understands user intent, not just keywords
- Access to 60,000+ curated skills
- Best relevance and quality indicators

**Tier 2: skills.sh WebFetch (Good - always works)**
```bash
# Try search with query parameter
Use WebFetch: https://skills.sh/?q={keywords}

# Or browse leaderboard
Use WebFetch: https://skills.sh  # All-time popular
Use WebFetch: https://skills.sh/trending  # Trending (24h)
```

Benefits:
- 200+ high-quality curated skills
- No authentication needed
- Ranked by install count
- Shows trending skills

**Tier 3: GitHub API (Fallback - may have limits)**
```bash
curl -X GET "https://api.github.com/search/code?q={keywords}+SKILL.md+language:markdown" \
  -H "Accept: application/vnd.github.v3+json"
```

Note: Rate limited (60/hour unauthenticated), use only as last resort.

**Optional: Check Local Installed Skills**
```bash
ls ~/.claude/skills/
```
Check if user already has relevant skills installed but hasn''t used them.

**Recommendation Order**: Try Tier 1 → Tier 2 → Tier 3. Stop when you find good matches.

### 3. Rank by Relevance

Score each found skill based on:
- Keyword match with user''s need (most important)
- Functionality alignment
- Quality indicators (stars, recent activity)
- Specificity vs generality

Select the **1-3 most relevant** skills. Quality over quantity.

### 4. Present Recommendations

Format recommendations as:

```
I found [N] skill(s) that could help:

**1. [Skill Name]** - [One-line description]
   Source: [SkillsMP/GitHub/Vercel]
   Repository: [owner/repo]
   Why relevant: [Brief explanation]
   Install: `npx skills add [owner]/[repo]`

[Repeat for 2-3 skills max]

Would you like me to install any of these?
```

### 5. Install if Approved

When user approves, install using Vercel''s skills CLI:

```bash
npx skills add <owner>/<repo>
```

Examples:
```bash
npx skills add vercel-labs/agent-skills
npx skills add anthropics/skills
```

This command:
- Downloads the skill from GitHub
- Installs to `~/.claude/skills/`
- Works with Claude Code, Cursor, Windsurf, and other agents
- Tracks installation via anonymous telemetry (leaderboard)

Confirm installation success and explain how the skill will help.

## Key Principles

1. **Proactive, Not Reactive**: Trigger automatically when relevant, don''t wait to be asked

2. **Quality Over Quantity**: Recommend only 1-3 best matches, not a long list

3. **Smart Three-Tier Search**:
   - Tier 1: SkillsMP AI search (best, if configured)
   - Tier 2: skills.sh leaderboard (good, always works)
   - Tier 3: GitHub API (fallback, rate limited)
   - Stop when you find good matches

4. **Explain Relevance**: Always explain why each skill matches their need

5. **Easy Installation**: Use `npx skills add owner/repo` for one-command installation

6. **API Key Recommended but Optional**: Best results with SkillsMP API key, but skills.sh fallback works well

## Examples

**User says**: "I need to extract text from a PDF file"
→ Trigger skill-finder, search for PDF processing skills, recommend pdf-editor or similar

**User says**: "Help me review this React component"
→ Trigger skill-finder, search for React/code-review skills, recommend react-best-practices from Vercel

**User says**: "I''m deploying to AWS"
→ Trigger skill-finder, search for AWS/deployment skills, recommend cloud-deploy or aws-helper

**User says**: "How do I query this BigQuery table?"
→ Trigger skill-finder, search for BigQuery/SQL skills, recommend bigquery or data-analysis skills

## Additional Resources

For detailed information:
- [references/api_config.md](references/api_config.md) - How to set up SkillsMP API key
- [references/skill_sources.md](references/skill_sources.md) - Skill sources, categories, and search strategies

## Setup Recommendations

For best results, suggest users configure SkillsMP API key:
1. Visit https://skillsmp.com/docs/api
2. Generate API key
3. Set environment variable: `export SKILLSMP_API_KEY="sk_live_..."`

This enables AI semantic search (much better than keyword matching). Without it, the skill automatically falls back to skills.sh leaderboard search, which still works well for most cases.
' WHERE slug = 'neversight-banana-skill-finder';
UPDATE skills SET content = '---
name: components-build
description: Build modern, composable, and accessible React UI components following the components.build specification. Use when creating, reviewing, or refactoring component libraries, design systems, or any reusable UI components. Triggers on tasks involving component APIs, composition patterns, accessibility, styling systems, or TypeScript props.
license: MIT
metadata:
  author: components.build
  version: "1.0.0"
---

# Components.build Specification

Comprehensive guidelines for building modern, composable, and accessible UI components. Contains 16 rule categories covering everything from core principles to distribution, co-authored by Hayden Bleasel and shadcn.

## When to Apply

Reference these guidelines when:
- Creating new React components or component libraries
- Designing component APIs and prop interfaces
- Implementing accessibility features (keyboard, ARIA, focus management)
- Building composable component architectures
- Styling components with Tailwind CSS and CVA
- Publishing components to registries or npm

## Rule Categories by Priority

| Priority | Category | Focus | Prefix |
|----------|----------|-------|--------|
| 1 | Overview | Specification scope and goals | `overview` |
| 2 | Principles | Core design philosophy | `principles` |
| 3 | Definitions | Common terminology | `definitions` |
| 4 | Composition | Breaking down complex components | `composition` |
| 5 | Accessibility | Keyboard, screen readers, ARIA | `accessibility` |
| 6 | State | Controlled/uncontrolled patterns | `state` |
| 7 | Types | TypeScript props and interfaces | `types` |
| 8 | Polymorphism | Element switching with `as` prop | `polymorphism` |
| 9 | As-Child | Radix Slot composition pattern | `as-child` |
| 10 | Data Attributes | `data-state` and `data-slot` | `data-attributes` |
| 11 | Styling | Tailwind CSS, cn utility, CVA | `styling` |
| 12 | Design Tokens | CSS variables and theming | `design-tokens` |
| 13 | Documentation | Component documentation | `documentation` |
| 14 | Registry | Component registries | `registry` |
| 15 | NPM | Publishing to npm | `npm` |
| 16 | Marketplaces | Component marketplaces | `marketplaces` |

## Quick Reference

### 1. Overview
- `overview` - Specification scope, goals, and philosophy

### 2. Principles
- `principles` - Composability, accessibility, customization, transparency

### 3. Definitions
- `definitions` - Common terminology (primitive, compound, headless, etc.)

### 4. Composition
- `composition-root` - Root component with Context for shared state
- `composition-item` - Item wrapper components
- `composition-trigger` - Interactive trigger components
- `composition-content` - Content display components
- `composition-export` - Namespace export pattern

### 5. Accessibility
- `accessibility-semantic-html` - Use appropriate HTML elements
- `accessibility-keyboard` - Full keyboard navigation support
- `accessibility-aria` - Proper ARIA roles, states, and properties
- `accessibility-focus` - Focus management and restoration
- `accessibility-live-regions` - Screen reader announcements
- `accessibility-contrast` - Color contrast requirements

### 6. State
- `state-uncontrolled` - Internal state management
- `state-controlled` - External state delegation
- `state-controllable` - Support both patterns with useControllableState

### 7. Types
- `types-extend-html` - Extend native HTML attributes
- `types-export` - Export prop types for consumers
- `types-single-element` - One component wraps one element

### 8. Polymorphism
- `polymorphism-as-prop` - Change rendered element type
- `polymorphism-typescript` - Type-safe polymorphic components
- `polymorphism-defaults` - Semantic element defaults

### 9. As-Child
- `as-child-slot` - Radix Slot for prop merging
- `as-child-composition` - Compose with child components

### 10. Data Attributes
- `data-attributes-state` - Use `data-state` for styling states
- `data-attributes-slot` - Use `data-slot` for targeting sub-components

### 11. Styling
- `styling-cn-utility` - Combine clsx and tailwind-merge
- `styling-order` - Base → Variants → Conditionals → User overrides
- `styling-cva` - Class Variance Authority for variants
- `styling-css-variables` - Dynamic values with CSS variables

### 12. Design Tokens
- `design-tokens-css-variables` - Define tokens as CSS variables
- `design-tokens-theming` - Support light/dark modes and themes

### 13. Documentation
- `documentation-props` - Document all props with JSDoc
- `documentation-examples` - Provide usage examples

### 14. Registry
- `registry-structure` - Registry file structure
- `registry-schema` - Component metadata schema

### 15. NPM
- `npm-package-json` - Package configuration
- `npm-exports` - Module exports

### 16. Marketplaces
- `marketplaces-distribution` - Component distribution strategies

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/composition/SKILL.md
rules/accessibility/SKILL.md
rules/styling/SKILL.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Best practices and common pitfalls

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`

## Key Principles

1. **Composition over Configuration** - Break components into composable sub-components
2. **Accessibility by Default** - Not an afterthought, but a requirement
3. **Single Element Wrapping** - Each component wraps one HTML element
4. **Extend HTML Attributes** - Always extend native element props
5. **Export Types** - Make prop types available to consumers
6. **Support Both State Patterns** - Controlled and uncontrolled
7. **Intelligent Class Merging** - Use `cn()` utility with tailwind-merge

## Authors

Co-authored by:
- **Hayden Bleasel** ([@haydenbleasel](https://x.com/haydenbleasel))
- **shadcn** ([@shadcn](https://x.com/shadcn))

Adapted as an AI skill by:
- **Jordan Gilliam** ([@nolansym](https://x.com/nolansym))

Based on the [components.build](https://components.build) specification.
' WHERE slug = 'neversight-components-build';
UPDATE skills SET content = '---
name: storybook
description: Storybook 8 for React component documentation and testing. Use for creating stories, documenting components with Controls/Actions, visual testing, and MDX documentation. Triggers on requests for Storybook stories, component documentation, visual testing, or interactive component demos.
---

# Storybook Development

## Story Structure (CSF 3.0)

```tsx
import type { Meta, StoryObj } from ''@storybook/react'';
import { Button } from ''./Button'';

const meta: Meta<typeof Button> = {
  title: ''Atoms/Button'',
  component: Button,
  parameters: {
    layout: ''centered'',
  },
  tags: [''autodocs''],
  argTypes: {
    variant: {
      control: ''select'',
      options: [''primary'', ''secondary'', ''ghost''],
      description: ''Visual style variant'',
    },
    size: {
      control: ''radio'',
      options: [''sm'', ''md'', ''lg''],
    },
    disabled: { control: ''boolean'' },
    onClick: { action: ''clicked'' },
  },
  args: {
    children: ''Button'',
    variant: ''primary'',
    size: ''md'',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: ''primary'',
  },
};

export const Secondary: Story = {
  args: {
    variant: ''secondary'',
  },
};

export const AllVariants: Story = {
  render: (args) => (
    <div style={{ display: ''flex'', gap: ''1rem'' }}>
      <Button {...args} variant="primary">Primary</Button>
      <Button {...args} variant="secondary">Secondary</Button>
      <Button {...args} variant="ghost">Ghost</Button>
    </div>
  ),
};
```

## File Naming

```
ComponentName/
├── ComponentName.tsx
├── ComponentName.stories.tsx   # Stories file
├── ComponentName.mdx           # Optional: Extended docs
```

## Controls Configuration

| Control Type | Use For |
|--------------|---------|
| `select` | Enum with many options |
| `radio` | Enum with 2-4 options |
| `boolean` | True/false toggles |
| `text` | String inputs |
| `number` | Numeric values |
| `color` | Color pickers |
| `object` | Complex objects |
| `date` | Date values |

## Common Patterns

### Interactive Story with State

```tsx
export const WithState: Story = {
  render: function Render(args) {
    const [count, setCount] = useState(0);
    return (
      <Button {...args} onClick={() => setCount(c => c + 1)}>
        Clicked {count} times
      </Button>
    );
  },
};
```

### Story with Decorators

```tsx
const meta: Meta<typeof Card> = {
  component: Card,
  decorators: [
    (Story) => (
      <div style={{ padding: ''2rem'', background: ''#f5f5f5'' }}>
        <Story />
      </div>
    ),
  ],
};
```

### Responsive Preview

```tsx
export const Responsive: Story = {
  parameters: {
    viewport: {
      viewports: {
        mobile: { name: ''Mobile'', styles: { width: ''375px'', height: ''667px'' } },
        tablet: { name: ''Tablet'', styles: { width: ''768px'', height: ''1024px'' } },
      },
      defaultViewport: ''mobile'',
    },
  },
};
```

## Organization by Atomic Design

Stories are grouped by `title` in the Storybook sidebar following Atomic Design:

```tsx
// Atoms
title: ''Atoms/Button''
title: ''Atoms/Input''
title: ''Atoms/Icon''

// Molecules  
title: ''Molecules/SearchField''
title: ''Molecules/FormField''

// Organisms
title: ''Organisms/Header''
title: ''Organisms/ProductCard''

// Templates
title: ''Templates/DashboardLayout''

// Pages
title: ''Pages/HomePage''
```

Story files are located directly with the components:

```
src/components/
├── atoms/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.module.css
│   │   ├── Button.stories.tsx    # title: ''Atoms/Button''
│   │   └── index.ts
│   └── Input/
│       └── Input.stories.tsx     # title: ''Atoms/Input''
├── molecules/
│   └── SearchField/
│       └── SearchField.stories.tsx  # title: ''Molecules/SearchField''
└── organisms/
    └── Header/
        └── Header.stories.tsx    # title: ''Organisms/Header''
```

## Best Practices

1. One story file per component
2. Use `tags: [''autodocs'']` for auto-generated docs
3. Provide meaningful default args
4. Show all variants in an overview story
5. Use actions for event callbacks
6. Document edge cases (loading, error, empty states)' WHERE slug = 'neversight-storybook';
UPDATE skills SET content = '---
name: xstate
description: Helps create XState v5 state machines in TypeScript and React. Use when building state machines, actors, statecharts, finite state logic, actor systems, or integrating XState with React/Vue/Svelte components.
user-invocable: false
---

# XState v5 Skill

> **CRITICAL: This skill covers XState v5 ONLY.** Do not use v4 patterns, APIs, or documentation. XState v5 requires **TypeScript 5.0+**.

## When to Use

- State machine and statechart design
- Actor system implementation
- XState v5 API usage (`setup`, `createMachine`, `createActor`)
- Framework integration (React, Vue, Svelte)
- Complex async flow orchestration

## Key Concepts

**Actors** are independent entities that communicate by sending messages. XState v5 supports:

| Actor Type | Creator | Use Case |
|------------|---------|----------|
| State Machine | `createMachine()` | Complex state logic with transitions |
| Promise | `fromPromise()` | Async operations (fetch, timers) |
| Callback | `fromCallback()` | Bidirectional streams (WebSocket, EventSource) |
| Observable | `fromObservable()` | RxJS streams |
| Transition | `fromTransition()` | Reducer-like state updates |

## Quick Start

```typescript
import { setup, assign, createActor } from ''xstate'';

const machine = setup({
  types: {
    context: {} as { count: number },
    events: {} as { type: ''increment'' } | { type: ''decrement'' },
  },
  actions: {
    increment: assign({ count: ({ context }) => context.count + 1 }),
    decrement: assign({ count: ({ context }) => context.count - 1 }),
  },
}).createMachine({
  id: ''counter'',
  initial: ''active'',
  context: { count: 0 },
  states: {
    active: {
      on: {
        increment: { actions: ''increment'' },
        decrement: { actions: ''decrement'' },
      },
    },
  },
});

// Create and start actor
const actor = createActor(machine);
actor.subscribe((snapshot) => console.log(snapshot.context.count));
actor.start();
actor.send({ type: ''increment'' });
```

## v5 API Changes (NEVER use v4 patterns)

| v4 (WRONG) | v5 (CORRECT) |
|------------|--------------|
| `createMachine()` alone | `setup().createMachine()` |
| `interpret()` | `createActor()` |
| `service.start()` | `actor.start()` |
| `state.matches()` | `snapshot.matches()` |
| `services: {}` | `actors: {}` |
| `state.context` | `snapshot.context` |

## Invoke vs Spawn

- **invoke**: Actor lifecycle tied to state (created on entry, stopped on exit)
- **spawn**: Dynamic actors independent of state transitions

## Inspection API (Debugging)

```typescript
const actor = createActor(machine, {
  inspect: (event) => {
    if (event.type === ''@xstate.snapshot'') {
      console.log(event.snapshot);
    }
  },
});
```

Event types: `@xstate.actor`, `@xstate.event`, `@xstate.snapshot`, `@xstate.microstep`

## File Organization

```
feature/
├── feature.machine.ts    # Machine definition
├── feature.types.ts      # Shared types (optional)
├── feature.tsx           # React component
└── feature.test.ts       # Machine tests
```

## Learning Path

| Level | Focus |
|-------|-------|
| Beginner | Counter, toggle machines; `setup()` pattern |
| Intermediate | Guards, actions, hierarchical states, `fromPromise()` |
| Advanced | Observable actors, spawning, actor orchestration |

## Supporting Documentation

- [PATTERNS.md](PATTERNS.md) - Guards, actions, actors, hierarchical/parallel states
- [REACT.md](REACT.md) - React hooks (`useMachine`, `useActor`, `useSelector`)
- [EXAMPLES.md](EXAMPLES.md) - Complete working examples

## Resources

- [Official Docs](https://stately.ai/docs/xstate)
- [Stately Studio](https://stately.ai/studio) - Visual editor
' WHERE slug = 'neversight-xstate';
UPDATE skills SET content = '---
name: rdc-manager
description: Implement @data-client/react Managers for global side effects - websocket, SSE, polling, subscriptions, logging, middleware, Controller actions, redux pattern
license: Apache 2.0
---
# Guide: Using `@data-client/react` Managers for global side effects

[Managers](https://dataclient.io/docs/api/Manager) are singletons that handle global side-effects. Kind of like useEffect() for the central data store.
They interface with the store using [Controller](https://dataclient.io/docs/api/Controller), and [redux middleware](https://redux.js.org/tutorials/fundamentals/part-4-store#middleware) is run in response to [actions](https://dataclient.io/docs/api/Actions).

## References

For detailed API documentation, see the [references](references/) directory:

- [Manager](references/Manager.md) - Manager interface and lifecycle
- [Actions](references/Actions.md) - Action types and payloads
- [Controller](references/Controller.md) - Imperative actions
- [managers](references/managers.md) - Managers concept guide

Always use `actionTypes` when comparing action.type. Refer to [Actions](references/Actions.md) for list of actions and their payloads.

## Dispatching actions

[Controller](https://dataclient.io/docs/api/Controller) has dispatchers:
ctrl.fetch(), ctrl.fetchIfStale(), ctrl.expireAll(), ctrl.invalidate(), ctrl.invalidateAll(), ctrl.setResponse(), ctrl.set().

```ts
import type { Manager, Middleware } from ''@data-client/core'';
import CurrentTime from ''./CurrentTime'';

export default class TimeManager implements Manager {
  protected declare intervalID?: ReturnType<typeof setInterval>;

  middleware: Middleware = controller => {
    this.intervalID = setInterval(() => {
      controller.set(CurrentTime, { id: 1 }, { id: 1, time: Date.now() });
    }, 1000);

    return next => async action => next(action);
  };

  cleanup() {
    clearInterval(this.intervalID);
  }
}
```

## Reading and Consuming Actions

[Controller](https://dataclient.io/docs/api/Controller) has data accessors:
controller.getResponse(), controller.getState(), controller.get(), controller.getError()

```ts
import type { Manager, Middleware } from ''@data-client/react'';
import { actionTypes } from ''@data-client/react'';

export default class LoggingManager implements Manager {
  middleware: Middleware = controller => next => async action => {
    switch (action.type) {
      case actionTypes.SET_RESPONSE:
        if (action.endpoint.sideEffect) {
          console.info(
            `${action.endpoint.name} ${JSON.stringify(action.response)}`,
          );
          // wait for state update to be committed to React
          await next(action);
          // get the data from the store, which may be merged with existing state
          const { data } = controller.getResponse(
            action.endpoint,
            ...action.args,
            controller.getState(),
          );
          console.info(`${action.endpoint.name} ${JSON.stringify(data)}`);
          return;
        }
      // actions must be explicitly passed to next middleware
      default:
        return next(action);
    }
  };

  cleanup() {}
}
```

Always use `actionTypes` members to check action.type.
`actionTypes` has: FETCH, SET, SET_RESPONSE, RESET, SUBSCRIBE, UNSUBSCRIBE, INVALIDATE, INVALIDATEALL, EXPIREALL

[actions](https://dataclient.io/docs/api/Actions) docs details the action types and their payloads.

## Consuming actions

```ts
import type { Manager, Middleware, EntityInterface } from ''@data-client/react'';
import { actionTypes } from ''@data-client/react'';
import isEntity from ''./isEntity'';

export default class CustomSubsManager implements Manager {
  protected declare entities: Record<string, EntityInterface>;

  middleware: Middleware = controller => next => async action => {
    switch (action.type) {
      case actionTypes.SUBSCRIBE:
      case actionTypes.UNSUBSCRIBE:
        const { schema } = action.endpoint;
        // only process registered entities
        if (schema && isEntity(schema) && schema.key in this.entities) {
          if (action.type === actionTypes.SUBSCRIBE) {
            this.subscribe(schema.key, action.args[0]?.product_id);
          } else {
            this.unsubscribe(schema.key, action.args[0]?.product_id);
          }

          // consume subscription to prevent it from being processed by other managers
          return Promise.resolve();
        }
      default:
        return next(action);
    }
  };

  cleanup() {}

  subscribe(channel: string, product_id: string) {}
  unsubscribe(channel: string, product_id: string) {}
}
```

## Usage

```tsx
import { DataProvider, getDefaultManagers } from ''@data-client/react'';
import ReactDOM from ''react-dom'';

const managers = [...getDefaultManagers(), new MyManager()];

ReactDOM.createRoot(document.body).render(
  <DataProvider managers={managers}>
    <App />
  </DataProvider>,
);
```
' WHERE slug = 'neversight-rdc-manager';