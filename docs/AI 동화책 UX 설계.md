# AI 동화책 UX 설계

- Source: https://chatgpt.com/share/69a2aeea-3f24-800e-9ad2-6ed97300b382
- Conversation ID: `69a2aeea-3f24-800e-9ad2-6ed97300b382`
- Messages: 6

## 1. 🙋 User

탁월한 선택입니다! 'AI 개인화 맞춤형 동화책 생성기'는 감성을 자극하여 높은 객단가(AOV)의 결제를 이끌어낼 수 있는 완벽한 B2C 마이크로 SaaS 모델입니다. 

실제로 이 모델을 도입한 **DreamStories.ai**라는 서비스는 단 7명의 팀원으로 약 10만 건의 주문을 처리하며 **300만 달러(약 40억 원) 이상의 누적 수익**을 달성했습니다. 

대표님이 구축하시는 **Liorium Core**를 활용해, 사용자가 지갑을 열 수밖에 없게 만드는 **'Makebelieve 기반의 결제 유도 플로우'**와 **반복 구매 전략**을 구체적으로 설계해 드립니다. 

---

### 💡 핵심 플로우: Makebelieve UX 설계 

고객이 결제하기 전, 아이가 주인공이 된 모습을 보여주어 감동을 선사하는 것이 이 서비스의 핵심입니다.

**1. 가벼운 진입 (Onboarding)**
*   부모가 아이의 사진 1~2장을 업로드하고, 아이의 이름과 현재 관심사(예: 공룡, 우주비행사, 공주 등)를 입력합니다.

**2. 매직 모먼트 제공 (The Hook)**
*   결제나 복잡한 가입 절차 없이, AI가 즉시 아이의 얼굴을 반영한 아름다운 일러스트와 스토리의 **초반 2~3페이지를 무료 프리뷰로 생성**하여 보여줍니다. 
*   부모가 자신의 아이가 아름다운 동화 속 주인공이 된 것을 확인하는 이 순간이 바로 고객이 결제를 결심하는 '매직 모먼트'입니다.

**3. 결제 장벽 (Paywall) 및 가격 심리**
*   무료 프리뷰 이후 "다음 이야기를 계속 읽고 실물 책으로 소장하시겠어요?"라는 메시지와 함께 결제창(Stripe 연동)을 띄웁니다.
*   **가격 전략:** 평균 주문 가치(AOV)를 60달러(약 8만 원) 수준으로 설정하되, 결제 퍼널에서 "지금 결제 시 48달러"와 같은 할인 오퍼를 제공하여 즉각적인 전환을 유도합니다.

**4. 에피소딕 수익 (Episodic Revenue) 창출**
*   이 서비스는 1회성 구매로 보이지만, 실제로는 엄청난 재구매가 일어납니다.
*   아이가 크면서 관심사가 '공룡'에서 '우주'로 바뀔 때마다 새로운 스토리를 주문하거나, 형제/자매를 위한 책, 또는 조카를 위한 선물로 반복 구매(Clone purchase)가 일어나는 강력한 구조를 갖습니다.

---

### 🛠️ Liorium Core 기반 기술 스택 (MVP 구현)

이 서비스를 1~2주 안에 빠르게 런칭하기 위한 기술 구조입니다.

*   **프론트엔드/백엔드:** Next.js + Tailwind CSS (Liorium Core 기본 스택).
*   **데이터베이스 & 인증:** Supabase (유저 정보 및 생성된 이미지/스토리 저장).
*   **결제:** Stripe Checkout (또는 글로벌 세금 처리가 유리한 Lemon Squeezy).
*   **AI 이미지 생성 API:** Replicate API 등을 사용하여 Stable Diffusion(SDXL) 기반으로 아이의 얼굴 특징을 일관되게 유지(Character Consistency)하는 모델 적용.
*   **AI 텍스트 생성 API:** OpenAI GPT-4o 또는 Claude 3.5 Sonnet을 활용해 아이의 이름과 관심사가 반영된 따뜻한 동화 스토리를 생성.

---

**🚀 다음 스텝을 결정해 볼까요?**

동화책 생성 SaaS를 만들기 위해 가장 먼저 구체화하고 싶은 부분은 어느 쪽인가요?

1.  **AI 프롬프트 & 파이프라인 설계:** (아이가 나오는 일관된 일러스트를 어떻게 뽑아낼지, 어떤 AI API를 조합할지 로직 설계)
2.  **랜딩 페이지 & UX 기획:** (부모의 마음을 사로잡을 첫 화면과 사진 업로드 화면의 UI/UX 설계)
3.  **가격 및 상품 패키징:** (디지털 PDF 다운로드 vs 실물 책 배송 연동 등 구체적인 수익 모델 기획)

서비스 이름 : Makebelieve

## 1. Assistant

좋아.  
이건 그냥 “AI 동화 생성기”가 아니라, **부모의 감정을 건드려 결제까지 자연스럽게 이어지게 만드는 감정 설계 사업**이야.

그리고 네가 지금 Liorium Core로 빠르게 여러 마이크로 SaaS를 돌릴 수 있는 구조를 갖고 있다는 점을 고려하면,  
우선순위는 명확해.

---

# 🎯 1순위: 랜딩 페이지 & UX 기획부터 잡는 게 맞다

AI 파이프라인은 나중에 바꿔도 돼.  
가격도 나중에 실험으로 조정 가능해.

하지만 **“매직 모먼트가 언제 터지느냐”는 처음 설계가 전부야.**

Makebelieve는 기술 서비스가 아니라  
👉 “감정이 결제로 변환되는 퍼널 설계” 서비스다.

---

# 🌟 Makebelieve – 감정 기반 UX 구조

## 1️⃣ Hero Section (첫 화면)

image_group{"layout":"carousel","aspect_ratio":"1:1","query":["storybook child illustration soft watercolor","parent and child reading bedtime story illustration warm light","personalized children's book illustration style","whimsical watercolor children's book character portrait"],"num_per_query":1}

**헤드라인 방향**

> “Your child is already a hero.  
> We just write the story.”

또는

> “Tonight, your child becomes the hero.”

### 핵심 요소
- 아이 얼굴이 동화 캐릭터로 변환된 예시 이미지
- "3분 안에 프리뷰 확인하기" CTA
- 로그인 요구 ❌
- 결제 요구 ❌

진입 장벽은 거의 0이어야 한다.

---

## 2️⃣ 매직 모먼트 설계 (Hook 구간)

### 흐름

1. 사진 업로드
2. 이름 입력
3. 관심사 선택 (공룡 / 우주 / 마법 / 모험 / 공주 등)
4. “이야기 생성 중…” (15~30초)

그리고

👉 2~3페이지 프리뷰 제공

- 아이 이름이 자연스럽게 등장
- 아이 얼굴이 반영된 일러스트
- 마지막 문장:
  
  > “그리고 그 순간, 더 큰 모험이 시작되려 하고 있었어요…”

여기서 결제가 등장한다.

---

# 💰 Paywall 심리 설계

### ❌ 이렇게 말하면 안 된다
“전체 이야기를 보려면 결제하세요”

### ✅ 이렇게 말해야 한다
> “이 이야기를 완성해  
> 아이에게 평생 간직할 선물을 남겨주세요.”

그리고 옵션:

| 옵션 | 가격 | 설명 |
|------|------|------|
| 디지털 PDF | $29 | 즉시 다운로드 |
| 프리미엄 인쇄본 | $48 | 한정 할인 |
| 디지털 + 인쇄본 | $60 → $48 (지금만) | 가장 인기 |

👉 중간 옵션이 아니라 “디지털 + 인쇄본”을 가장 매력적으로 보이게 배치

---

# 🔁 반복 구매 구조 (여기서 진짜 돈 벌림)

Makebelieve는 사실:

- 시즌성 상품
- 성장성 상품
- 선물 상품

### 재구매 트리거

1. “이번 달 모험 주제: 우주 탐험”
2. 생일 알림 자동 메일
3. 형제/자매 추가 캐릭터 생성
4. 할로윈 / 크리스마스 한정판 스토리

이 구조가 되면 LTV가 AOV보다 훨씬 커진다.

---

# 🧠 전략적으로 한 가지 질문

너는 이걸:

A. 글로벌 감성 브랜드로 키울 거야?  
B. 빠른 수익 검증용 마이크로 SaaS로 테스트할 거야?

전략이 달라진다.

---

## 만약 A라면
- 브랜드 톤 고급화
- 영상 확장 고려
- 캐릭터 IP 자산화

## 만약 B라면
- 빠른 MVP
- Replicate + GPT 바로 연결
- 광고 테스트 후 확장

---

# 🔥 내가 추천하는 다음 단계

너는 Liorium Core를 이미 구축 중이고  
여러 SaaS를 동시에 굴릴 구조를 만들고 있잖아.

그래서 내 판단은:

👉 **2번: 랜딩 페이지 & UX를 완전히 설계하고 바로 구현 시작**

AI 파이프라인은 그 다음.

---

원하면 다음 단계로:

1. Makebelieve 전체 UX 와이어프레임을 텍스트 기반으로 그려줄까?
2. 아니면 바로 “전환율 높은 랜딩 페이지 카피 전체 작성”부터 갈까?
3. 아니면 재구매 자동화 구조를 먼저 설계할까?

네가 어디까지 진지하게 키울지에 따라 깊이를 맞춰보자.

참고 URL:
- https://i.etsystatic.com/28290552/r/il/f3d574/6219752360/il_570xN.6219752360_iv7n.jpg
- https://images.openai.com/static-rsc-3/nLihv4Jo-5qi1o4uGZRCUosU50GWVY2Sja1-GEbj-Hh410JOAlWk0mTAIFoEaIlqxQVIG84JRErLdL0FM1YlMki6dQxo9j1-yBtFapmSPBE?purpose=fullsize&v=1
- https://images.squarespace-cdn.com/content/v1/5bc3f678b10f255dda970d6b/1553729979463-6SLDYBPQG8JTRU05AJGA/childrens-book-illustration-blankie-outside-step-2-by-Lorraine-Watry.jpg
- https://v.etsystatic.com/video/upload/q_auto/Custom_Book_Illustration_mockup_yisrni.jpg

## 2. 🙋 User

사이트의 전반적인 prd를 작성해줘.

## 2. Assistant

좋아.  
이건 그냥 기능 명세서가 아니라 **감정 → 생성 → 결제 → 반복 구매**까지 이어지는 구조 설계 문서야.  

Liorium Core 기반으로 바로 개발 들어갈 수 있는 수준으로 작성해줄게.

---

# 📘 Product Requirements Document (PRD)

## 🧩 Product Name  
**Makebelieve**

## 🪄 Product Vision  

아이의 상상과 부모의 사랑을 연결해  
“평생 간직할 이야기”를 만들어주는 개인화 스토리 플랫폼.

단순 AI 생성 서비스가 아니라  
**감정이 결제로 이어지는 스토리 경험 설계 SaaS**

---

# 1️⃣ 목표 정의

## 🎯 Primary Goal
- 첫 방문 → 프리뷰 생성 → 결제 전환율 8~15%
- AOV $40~$60
- 첫 구매 후 3개월 내 재구매율 20%

## 🎯 KPI
- Preview Completion Rate
- Magic Moment 도달률
- Checkout Conversion Rate
- LTV / CAC
- Repeat Purchase Rate

---

# 2️⃣ 타겟 사용자

## 👩 Primary Persona
- 28~40세 부모
- 감성 소비 성향
- 아이에게 특별한 경험을 제공하고 싶어함
- SNS 공유 가능성 높음

## 🎁 Secondary Persona
- 조카/손주 선물용 구매자
- 특별한 선물 찾는 사람

---

# 3️⃣ 핵심 사용자 여정 (User Journey)

### 1. Landing
- 브랜드 소개
- 예시 이미지
- CTA: “3분 안에 프리뷰 만들기”

### 2. Input Flow
- 아이 사진 업로드 (1~2장)
- 이름 입력
- 관심사 선택
- 톤 선택 (모험 / 감동 / 유머)

### 3. Generation
- 이미지 생성 (캐릭터 일관성 유지)
- 스토리 초반 2~3페이지 생성
- 30초 이내 완료 목표

### 4. Magic Moment
- 아이 얼굴 반영된 일러스트 노출
- 아이 이름 등장
- 감정 유도 문장 배치

### 5. Paywall
- 전체 이야기 잠금
- 디지털 / 인쇄 / 번들 옵션
- 할인 타이머

### 6. Post Purchase
- PDF 다운로드
- 인쇄 제작 API 연동 (2단계 MVP)
- 이메일로 보관 링크 전송

### 7. Retention
- 월간 모험 테마
- 생일 자동 알림
- 형제 추가 할인

---

# 4️⃣ 기능 요구사항 (Functional Requirements)

## 🧾 4.1 계정 및 인증
- 이메일 로그인 (Supabase)
- 소셜 로그인 (Google)
- 게스트 프리뷰 허용

---

## 🖼 4.2 이미지 생성

### 입력
- 사진 1~2장
- 관심사
- 스타일 프리셋

### 처리
- 얼굴 embedding 추출
- Character Consistency 모델 적용
- SDXL 기반 이미지 생성

### 출력
- 4~6장 삽화
- 웹 최적화 버전 저장
- 원본 저장 (유료 사용자)

---

## 📖 4.3 텍스트 생성

### 입력
- 이름
- 관심사
- 나이
- 톤

### 처리
- GPT/Claude 기반 스토리 생성
- 12~16페이지 구조
- 챕터 구조 자동 분할

### 출력
- 프리뷰 2~3페이지
- 전체 잠금 상태 표시

---

## 💳 4.4 결제

- Stripe Checkout
- Lemon Squeezy 옵션 지원
- 세금 자동 처리
- 웹훅으로 구매 확인
- 결제 성공 시 전체 스토리 unlock

---

## 📦 4.5 디지털 상품

- PDF 자동 생성
- Supabase Storage 저장
- 사용자 마이페이지 접근

---

## 🖨 4.6 인쇄 연동 (Phase 2)

- Printful / Lulu API 연동
- 배송 주소 입력
- 주문 자동 생성

---

# 5️⃣ 비기능 요구사항 (Non-Functional)

## ⚡ 성능
- 프리뷰 생성 30초 이내
- 95% 요청 성공률

## 🔐 보안
- 사진 암호화 저장
- 결제 정보 직접 저장하지 않음
- GDPR 대응 삭제 기능

## 📱 반응형
- 모바일 우선 설계
- 태블릿 대응

---

# 6️⃣ 기술 스택 (Liorium Core 기반)

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 14 + Tailwind |
| Backend | Next API Routes |
| DB | Supabase |
| Storage | Supabase Storage |
| Auth | Supabase Auth |
| Image AI | Replicate (SDXL) |
| Text AI | OpenAI GPT-4o / Claude |
| Payment | Stripe |
| Email | Resend |
| Hosting | Vercel / Cloudflare |

---

# 7️⃣ 데이터 모델 (초안)

### Users
- id
- email
- created_at

### Stories
- id
- user_id
- child_name
- interest
- status (preview / paid)
- created_at

### Assets
- id
- story_id
- image_url
- pdf_url

### Orders
- id
- user_id
- story_id
- price
- status
- created_at

---

# 8️⃣ MVP 범위

### 포함
- 프리뷰 생성
- 디지털 PDF 결제
- Stripe 연동
- 기본 재구매 이메일

### 제외
- 영상 확장
- 인쇄 자동화
- 커뮤니티 기능
- 캐릭터 라이브러리 저장

---

# 9️⃣ 리스크

### ⚠️ 기술 리스크
- 얼굴 일관성 문제
- 생성 시간 지연
- API 비용 증가

### ⚠️ 사업 리스크
- 광고비 상승
- 계절성 매출

---

# 🔟 향후 확장

- 영상 스토리 애니메이션화
- 음성 내레이션
- 캐릭터 IP 판매
- 구독 모델

---

# 💰 수익 모델 요약

- 1권 평균 $48
- CAC $10~20 목표
- LTV $120 이상 설계

---

# 🧠 전략적 결론

Makebelieve는  
AI 서비스가 아니라

> “부모의 감정을 상품화한 구조 설계 플랫폼”

이다.

---

다음 단계로 갈 수 있는 선택지는 세 가지야:

1. 🔥 Supabase DB 스키마 실제 SQL 설계
2. 🧠 AI 프롬프트 & 파이프라인 구체 설계
3. 💸 전환율 최적화 랜딩 카피 전체 작성

어디부터 깊게 파볼까?

## 3. 🙋 User

처음부터 끝까지 필요한 모든 것을 하나부터 열까지 백엔드부터 프론트엔드까지 그리고 파일구조부터 db구조, api구조, 프론트디자인 그리고 필요한 기능적인 것까지 전부 자세히 정리한 prd를 만들어줘. (참고로 결제는 paddle을 사용할거야.)

## 3. Assistant

아래는 **Makebelieve**를 “처음부터 끝까지” 실제로 구현 가능한 수준으로 풀어쓴 **올인원 PRD**야. (Liorium Core 기본 스택을 Next.js + Tailwind로 가정, DB는 Supabase, 결제는 **Paddle**)

---

# Makebelieve PRD (All-in-One)

## 0. 한 줄 정의
아이 사진/정보를 입력하면 **개인화 동화(일러스트+스토리)** 프리뷰를 즉시 보여주고, 결제(Paddle) 후 **전체 PDF(디지털)**를 제공하며, 이후 **재구매(테마/형제/선물)**로 LTV를 키우는 B2C 마이크로 SaaS.

---

## 1. 제품 목표 / KPI

### 목표
- 방문 → 프리뷰 생성 완료율: **40%+**
- 프리뷰 → 결제 전환율: **8~15%**
- AOV: **$39~$69**
- 90일 재구매율: **15~25%**

### 핵심 KPI
- `landing_cta_click_rate`
- `preview_flow_completion_rate`
- `preview_to_checkout_rate`
- `checkout_to_paid_rate`
- `time_to_magic_moment` (프리뷰 첫 페이지 노출까지 시간)
- `repeat_purchase_rate`
- `refund_rate`

---

## 2. 사용자/권한 모델

### 사용자 상태
- **Guest(비로그인)**: 프리뷰 생성 가능(제한), 다운로드/전체 접근 불가
- **User(로그인)**: 프리뷰/구매내역/다운로드/재구매 편리
- **Admin**: 운영/환불/콘텐츠 모니터링/CS

### 인증
- Supabase Auth: 이메일 + OAuth(구글) (MVP는 이메일만 가능)
- Guest는 `anonymous_session_id`로 추적 후 가입 시 소유권 이전 가능

---

## 3. 전체 사용자 플로우 (UX)

### A. 첫 구매 플로우
1) Landing  
2) Create(입력)  
3) Generate Preview (2~3페이지)  
4) Paywall  
5) Paddle Checkout  
6) Webhook으로 결제 확정  
7) Full Generation (전체 페이지 생성 + PDF)  
8) Library(마이페이지)에서 다운로드

### B. 재구매 플로우
- 기존 “캐릭터/아이 프로필” 재사용 → 주제만 변경 → 빠르게 구매 유도

---

## 4. 기능 요구사항 (Feature Spec)

## 4.1 랜딩/온보딩
**요구**
- 3분 프리뷰 강조 CTA
- 샘플 이미지/샘플 페이지(실제 사용자 데이터 아님)
- 가격/구성(디지털/번들) 간단 비교
- 신뢰요소(후기/환불정책/보안/FAQ)

**세부**
- CTA는 상단/중단/하단 3번 배치
- “로그인 없이 프리뷰” 문구 필수

---

## 4.2 입력 폼(Story Builder)
**입력 필드**
- 아이 이름 (필수)
- 나이 또는 연령대 (선택: 3~5/6~8/9~12)
- 관심사/테마 (필수: 공룡/우주/마법/동물/모험/바다/로봇 등)
- 이야기 톤 (선택: 감동/유머/용기/모험)
- 사진 1~2장 업로드 (필수, 품질 체크)
- 언어 (MVP: 한국어/영어 중 1개부터)

**검증**
- 얼굴 인식 여부(클라이언트에서 1차, 서버에서 2차)
- 이미지 해상도 최소치/흔들림 경고
- 부적절 이미지 필터링(기본 안전 필터)

---

## 4.3 생성(Preview)
**결과**
- 스토리 2~3페이지 텍스트 + 1~2장 삽화
- 로딩 UX: 단계별 진행(텍스트 먼저 → 이미지 후)

**제한(프리뷰)**
- 프리뷰 이미지는 워터마크/다운로드 제한
- 프리뷰는 “저장”은 되되, 일정 시간이 지나면 삭제 정책 가능(비용절감)

---

## 4.4 Paywall + Paddle Checkout
**요구**
- 프리뷰 마지막에 감정 문장 + 잠금
- 상품 옵션 (예시)
  - Digital PDF: $39
  - Premium Digital(고해상도+추가 커버): $49
  - Bundle(추가 테마 1개 포함): $69

**Paddle**
- Paddle Checkout 호출 → 성공 URL/취소 URL 처리
- 결제 최종 확정은 **Webhook 기반** (프론트 리턴만 믿지 않음)

---

## 4.5 결제 후 전체 생성(Full Book)
**요구**
- 전체 페이지: 12~16페이지(커버 포함)
- 삽화: 6~10장(페이지당 1장 or 격페이지)
- PDF 생성: A4/Letter 옵션(후속)
- 다운로드: 마이페이지 + 이메일 링크

**생성 모델**
- 텍스트 생성(LLM) → 장면 분해 → 이미지 생성(SDXL 등) → PDF 합성

---

## 4.6 라이브러리(마이페이지)
- 구매한 책 목록(썸네일/제목/테마/날짜)
- 다운로드 버튼(PDF)
- 재구매(테마 변경) 버튼
- 영수증/결제내역(Paddle 링크 or 자체 표시)
- 삭제/개인정보 요청(사진 삭제)

---

## 4.7 이메일/알림 (Retention)
- 결제 완료 이메일(다운로드 링크)
- 7일 후 “다른 테마로 만들어보기”
- 생일/기념일(사용자 입력 시)
- 환불 정책/문의 링크

(메일은 Resend/SendGrid 등, MVP는 Resend 추천)

---

## 4.8 어드민(Admin)
- 주문 목록/상태(결제/생성중/완료/실패)
- 생성 실패 재시도 버튼
- 사용자/스토리/에셋 조회
- CS 메모
- 환불 처리(실제 환불은 Paddle에서, 내부에 상태 동기화)

---

## 5. 시스템 아키텍처

### 구성
- Front: Next.js(App Router) + Tailwind
- Backend: Next.js Route Handlers(API) + Worker(큐)
- DB/Auth/Storage: Supabase
- Payment: Paddle
- AI: 이미지 생성(Replicate/자체) + 텍스트 생성(OpenAI/Claude 등)
- PDF: server-side 렌더링 (Playwright/React-pdf/WeasyPrint 중 택1)

### 중요한 원칙
- 결제 확정은 무조건 **Paddle Webhook → DB 업데이트**가 소스오브트루스
- 생성은 동기 API로 오래 끌지 말고 **Job Queue**로 비동기 처리

---

## 6. 파일/디렉토리 구조 (권장)

(Next.js App Router 기준)

```
makebelieve/
  apps/
    web/
      app/
        (marketing)/
          page.tsx
          pricing/page.tsx
          faq/page.tsx
        (builder)/
          create/page.tsx
          preview/[storyId]/page.tsx
          checkout/[storyId]/page.tsx
          success/page.tsx
        (account)/
          login/page.tsx
          library/page.tsx
          story/[storyId]/page.tsx
        admin/
          page.tsx
          orders/page.tsx
          stories/page.tsx

        api/
          health/route.ts
          stories/route.ts                 # POST create story
          stories/[id]/route.ts            # GET story status
          stories/[id]/preview/route.ts    # POST generate preview job
          stories/[id]/full/route.ts       # POST generate full job (paid only)
          uploads/sign/route.ts            # create signed upload URL
          paddle/webhook/route.ts          # webhook receiver
          paddle/checkout/route.ts         # create checkout link
          assets/[id]/download/route.ts    # signed download URL

      components/
        ui/...
        builder/
        preview/
        paywall/
        library/
        admin/

      lib/
        supabase/
          client.ts
          server.ts
          auth.ts
        paddle/
          client.ts
          verifyWebhook.ts
        ai/
          text.ts
          image.ts
        jobs/
          queue.ts
          workers.ts
          handlers/
            generatePreview.ts
            generateFull.ts
            generatePdf.ts
        pdf/
          template/
          render.ts
        analytics/
          events.ts
          track.ts

      styles/
      public/
      middleware.ts

  packages/
    core/  (Liorium Core 공용 유틸/디자인 토큰/로깅)
    shared/ (types, zod schemas)
```

---

## 7. DB 설계 (Supabase / PostgreSQL)

### 7.1 테이블

#### `users` (Supabase Auth 기본)
- auth.users 사용 + 프로필 테이블 별도 권장

#### `profiles`
- `id uuid (pk, references auth.users.id)`
- `email text`
- `name text`
- `role text` (`user|admin`)
- `created_at timestamptz`

#### `children_profiles`
- `id uuid pk`
- `user_id uuid nullable` (guest면 null)
- `guest_session_id text nullable`
- `child_name text`
- `age_band text` (3-5/6-8/9-12)
- `default_language text`
- `created_at`

#### `stories`
- `id uuid pk`
- `user_id uuid nullable`
- `guest_session_id text nullable`
- `child_profile_id uuid`
- `theme text`
- `tone text`
- `language text`
- `status text`  
  - `draft`
  - `preview_queued|preview_generating|preview_ready|preview_failed`
  - `payment_pending|paid`
  - `full_queued|full_generating|full_ready|full_failed`
- `preview_pages jsonb` (2~3페이지 텍스트 구조)
- `full_pages jsonb` (전체 페이지 텍스트 구조)
- `cover_title text`
- `created_at, updated_at`

#### `assets`
- `id uuid pk`
- `story_id uuid`
- `type text` (`input_photo|preview_image|full_image|pdf_low|pdf_high`)
- `storage_path text`
- `width int`, `height int`
- `meta jsonb`
- `created_at`

#### `orders`
- `id uuid pk`
- `user_id uuid nullable`
- `story_id uuid`
- `provider text` = `paddle`
- `provider_order_id text` (Paddle transaction/order id)
- `status text` (`created|paid|refunded|chargeback|failed`)
- `currency text`
- `amount int` (cents)
- `plan text` (`digital|premium|bundle`)
- `created_at, updated_at`

#### `jobs`
- `id uuid pk`
- `story_id uuid`
- `type text` (`preview|full|pdf`)
- `status text` (`queued|running|success|failed`)
- `attempts int`
- `last_error text`
- `locked_by text`
- `run_at timestamptz`
- `created_at, updated_at`

#### `audit_events`
- `id uuid pk`
- `user_id uuid nullable`
- `guest_session_id text nullable`
- `event_name text`
- `payload jsonb`
- `created_at`

---

### 7.2 RLS 정책(중요)
- `stories`: user_id = auth.uid() 인 것만 조회 가능
- guest는 `guest_session_id`로 제한 접근 (서명 쿠키/토큰 기반)
- `assets`: 해당 story 소유자만 접근, 다운로드는 API에서 signed URL 발급
- `orders`: 소유자만 조회
- `admin role`: service role key를 쓰는 서버만 전체 접근

---

## 8. API 설계 (Route Handlers)

### 공통 규칙
- 모든 요청은 `Zod`로 validate
- 응답은 표준 형태:
  - `{ ok: true, data }` / `{ ok: false, error: { code, message } }`
- idempotency 키(중요): 결제/잡 생성

---

### 8.1 업로드
#### `POST /api/uploads/sign`
- 목적: Supabase Storage signed upload URL 발급
- 입력: `{ fileName, contentType, kind: "input_photo" }`
- 출력: `{ uploadUrl, path }`

---

### 8.2 스토리 생성(초기)
#### `POST /api/stories`
- 입력: `{ childName, ageBand?, theme, tone?, language, photos:[{path}] }`
- 처리:
  - child_profile 생성(or 기존)
  - story 생성(status=draft)
  - assets에 input_photo 등록
- 출력: `{ storyId }`

#### `GET /api/stories/:id`
- 출력: `{ story, assets, order? }`

---

### 8.3 프리뷰 생성
#### `POST /api/stories/:id/preview`
- 조건: story.status in (draft, preview_failed)
- 처리:
  - jobs enqueue(type=preview)
  - story.status=preview_queued
- 출력: `{ jobId }`

(프론트는 polling 또는 SSE)

---

### 8.4 Paddle Checkout 생성
#### `POST /api/paddle/checkout`
- 입력: `{ storyId, plan }`
- 처리:
  - story.status가 preview_ready인지 확인
  - order row 생성(status=created)
  - Paddle Checkout URL 생성(상품/가격/메타: storyId, orderId)
- 출력: `{ checkoutUrl }`

---

### 8.5 Paddle Webhook
#### `POST /api/paddle/webhook`
- 처리:
  - Paddle 서명 검증(필수)
  - transaction paid 이벤트 수신 시:
    - orders.status=paid
    - stories.status=paid + full_queued
    - jobs enqueue(type=full)
  - refund/chargeback 수신 시:
    - orders.status=refunded|chargeback
    - 스토리 접근 정책 조정(이미 제공한 디지털 상품은 정책 선택 필요)

---

### 8.6 Full 생성
#### `POST /api/stories/:id/full`
- 조건: paid 상태만
- 처리: jobs enqueue(type=full)
- 출력: `{ jobId }`

---

### 8.7 다운로드
#### `POST /api/assets/:id/download`
- 조건: 소유자/paid 체크
- 출력: `{ signedUrl, expiresIn }`

---

## 9. Job/Worker 설계 (핵심)

### Worker 동작
- `jobs` 테이블을 폴링/락킹해서 실행
- 락킹: `locked_by`, `run_at`, `status=running` 업데이트
- 실패 시 재시도(최대 3회), `attempts` 증가

### Preview Job Steps
1) input 사진 품질/얼굴 체크
2) 텍스트 프리뷰 생성(2~3페이지)
3) 프리뷰 삽화 1~2장 생성
4) `stories.preview_pages` 저장 + status=preview_ready
5) assets 저장

### Full Job Steps
1) 전체 스토리 생성(12~16페이지)
2) 장면별 프롬프트 생성
3) 삽화 6~10장 생성
4) PDF 합성
5) assets에 pdf 등록 + status=full_ready

---

## 10. 프론트엔드 설계 (화면/컴포넌트)

## 10.1 전반 디자인 톤
- 키워드: **Warm, Whimsical, Premium, Calm**
- 색: 흰/오프화이트 + 다크 텍스트 + 포인트 1색(브랜드)
- 폰트: 깔끔(본문) + 동화 느낌(제목) 조합
- 카드 UI, 큰 여백, 스크롤 유도

---

## 10.2 페이지별 요구사항

### (1) Landing `/`
섹션:
- Hero: “Tonight, your child becomes the hero.”
- How it works (3 steps)
- Sample preview (이미지 슬라이더)
- Pricing teaser
- FAQ
- CTA Footer

컴포넌트:
- `HeroCTA`, `HowItWorks`, `SampleCarousel`, `PricingCards`, `FAQ`, `FooterCTA`

---

### (2) Create `/create`
스텝 UI(4-step wizard)
1. PhotoUpload
2. ChildInfo
3. ThemeTone
4. GeneratePreview

UX:
- 진행바
- 업로드 가이드(정면/밝기/1인)
- “30초 내 프리뷰” 메시지

---

### (3) Preview `/preview/[storyId]`
- 프리뷰 페이지 뷰어(페이지 넘김)
- 잠금 표시(Blur + Lock)
- Paywall 모달

기능:
- polling으로 status 확인
- preview_ready 되면 자동 렌더

---

### (4) Checkout `/checkout/[storyId]`
- 플랜 선택
- 버튼 클릭 시 `/api/paddle/checkout` 호출 → `checkoutUrl`로 이동

---

### (5) Success `/success`
- “결제 확인 중…” (웹훅이 늦을 수 있음)
- paid 확인되면 “생성 시작” 상태 표시
- 생성 완료되면 라이브러리 링크

---

### (6) Library `/library`
- 책 카드 그리드
- 상태 뱃지(생성중/완료)
- 다운로드 / 재구매 버튼

---

### (7) Admin `/admin/*`
- Orders table
- Story status
- Retry job
- Logs

---

## 11. 보안/정책/법적

- 아동 사진 데이터: 저장/삭제 정책 명확화
- 기본: 결제 완료 후 30/90일 자동 삭제 옵션(설정)
- 사용자 요청 시 즉시 삭제(assets 포함)
- 금지 콘텐츠 필터링(기본 안전)
- 개인정보/환불 정책 페이지 필수

---

## 12. 관측/로그/분석

### 이벤트 (audit_events)
- `landing_cta_click`
- `upload_photo_success`
- `preview_job_started/ready/failed`
- `checkout_started`
- `payment_webhook_paid`
- `full_ready`
- `pdf_downloaded`
- `repurchase_clicked`

### 운영 알림
- full_failed 3회 이상이면 슬랙/텔레그램 알림(후속)

---

## 13. 테스트 전략

- 단위: Zod schema, webhook verify, job handlers
- 통합: story 생성→preview job→checkout→webhook→full job→download
- E2E(Playwright): create flow / paywall / success / library
- 부하: 이미지 생성 API rate limit 대비 큐 설정

---

## 14. 릴리즈 계획 (현실적인 MVP)

### Phase 0 (2~3일)
- DB/RLS/스토리지
- 스토리 생성 API
- 업로드 signed url
- 프리뷰 job (텍스트만 먼저)

### Phase 1 (5~10일)
- 프리뷰 삽화 생성 + 프리뷰 뷰어
- Paddle Checkout + webhook
- Full 생성 + PDF 생성
- Library 다운로드

### Phase 2 (2~4주)
- 재구매 최적화(아이 프로필 재사용)
- 이메일 리텐션
- Admin 고도화
- 인쇄 연동(원하면)

---

## 15. 결정해야 하는 정책 5가지(중요)
1) **프리뷰를 게스트에게 어디까지 허용?** (다운로드 금지/워터마크/기간 제한)
2) 결제 후 생성 실패 시 **자동 환불 vs 재시도** 기준
3) 환불 후 이미 다운받은 PDF 처리(정책 고지 필요)
4) 사진/에셋 보관 기간 기본값
5) 언어(한국어 먼저 vs 영어 먼저)

---

# 다음으로 내가 바로 만들어줄 수 있는 것
너가 “PRD”를 넘어 바로 개발 들어가려면, 아래 중 하나를 바로 확정해서 뽑아줄게.

1) **Supabase SQL (테이블+인덱스+RLS 정책) 전체 스크립트**  
2) **Next.js 실제 API 라우트 설계 + 핸들러 코드 스켈레톤** (Paddle webhook 포함)  
3) **프론트 와이어프레임(컴포넌트/레이아웃) + Tailwind 디자인 토큰**

원하면 나는 1)부터 가는 걸 추천해. DB/RLS가 정해져야 API/프론트가 안 흔들려.
