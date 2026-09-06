"""AI-Powered E-Commerce Shopping Assistant - TinyLlama + Gradio."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import torch
import gradio as gr
from transformers import AutoTokenizer, AutoModelForCausalLM

# ---------------- Block 2: Load TinyLlama ----------------
model_name = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto"
)

print("TinyLlama Model Loaded Successfully!")

# ---------------- Block 3: Product Dataset ----------------
products = [
    {
        "name": "Dell Inspiron 15",
        "category": "Laptop",
        "price": 55000,
        "rating": 4.5,
        "description": "15.6-inch laptop with Intel i5 processor and 8GB RAM."
    },
    {
        "name": "HP Pavilion",
        "category": "Laptop",
        "price": 65000,
        "rating": 4.6,
        "description": "Intel i7 processor, 16GB RAM, suitable for students and professionals."
    },
    {
        "name": "Samsung Galaxy S24",
        "category": "Mobile",
        "price": 70000,
        "rating": 4.8,
        "description": "Flagship smartphone with excellent camera and performance."
    },
    {
        "name": "iPhone 15",
        "category": "Mobile",
        "price": 80000,
        "rating": 4.9,
        "description": "Apple smartphone with A16 Bionic chip and premium features."
    },
    {
        "name": "Sony WH-1000XM5",
        "category": "Headphones",
        "price": 25000,
        "rating": 4.8,
        "description": "Wireless noise-cancelling headphones."
    }
]

print("Total Products:", len(products))


def _product_context():
    context = ""
    for product in products:
        context += (
            f"Product Name: {product['name']}\n"
            f"Category: {product['category']}\n"
            f"Price: Rs.{product['price']}\n"
            f"Rating: {product['rating']}\n"
            f"Description: {product['description']}\n\n"
        )
    return context


# ---------------- Block 4: Zero-Shot ----------------
def create_prompt_zero_shot(user_query):
    return f"""
You are an intelligent E-Commerce Assistant.

Use only the product information provided below.

Product Information:
{_product_context()}

User Question:
{user_query}

Answer:
"""


# ---------------- Block 5: One-Shot ----------------
def create_prompt_one_shot(user_query):
    return f"""
You are an intelligent E-Commerce Assistant.

Example:

User Question:
Which mobile has the highest rating?

Answer:
The iPhone 15 has the highest rating of 4.9.

Now answer the following question.

Product Information:
{_product_context()}

User Question:
{user_query}

Answer:
"""


# ---------------- Block 6: Few-Shot ----------------
def create_prompt_few_shot(user_query):
    return f"""
You are an intelligent E-Commerce Assistant.

Examples:

User Question:
Which mobile has the highest rating?

Answer:
The iPhone 15 has the highest rating of 4.9.

User Question:
Recommend a laptop under Rs.60000.

Answer:
Dell Inspiron 15 is recommended because it costs Rs.55000 and has a rating of 4.5.

User Question:
Suggest premium headphones.

Answer:
Sony WH-1000XM5 is a premium wireless noise-cancelling headphone with a rating of 4.8.

Now answer the following question.

Product Information:
{_product_context()}

User Question:
{user_query}

Answer:
"""


# ---------------- Block 7: Response Generation ----------------
def generate_response(user_query, prompt_type="few_shot"):
    if prompt_type == "zero_shot":
        prompt = create_prompt_zero_shot(user_query)
    elif prompt_type == "one_shot":
        prompt = create_prompt_one_shot(user_query)
    else:
        prompt = create_prompt_few_shot(user_query)

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    outputs = model.generate(
        **inputs,
        max_new_tokens=150,
        temperature=0.7,
        do_sample=True,
        top_p=0.9,
        pad_token_id=tokenizer.eos_token_id
    )

    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return response[len(prompt):].strip()


# ---------------- Blocks 11-19: Features ----------------
chat_history = []


def chatbot(query, prompt_type):
    response = generate_response(query, prompt_type=prompt_type)
    chat_history.append({"Question": query, "Answer": response})
    return response


def _find(name):
    for product in products:
        if product["name"].lower() == str(name).lower():
            return product
    return None


def compare_products(product1_name, product2_name):
    product1 = _find(product1_name)
    product2 = _find(product2_name)

    if not product1 or not product2:
        return "One or both products not found.", None

    comparison = f"""
Product Comparison

Product 1: {product1['name']}
Price: Rs.{product1['price']}
Rating: {product1['rating']}
Description: {product1['description']}

Product 2: {product2['name']}
Price: Rs.{product2['price']}
Rating: {product2['rating']}
Description: {product2['description']}
"""

    recommendation_query = (
        f"Compare {product1['name']} and {product2['name']} "
        f"and recommend the better product."
    )

    comparison += "\nAI Recommendation:\n"
    comparison += generate_response(recommendation_query, prompt_type="few_shot")

    return comparison, plot_comparison(product1, product2)


def plot_comparison(product1, product2):
    names = [product1["name"], product2["name"]]
    prices = [product1["price"], product2["price"]]
    ratings = [product1["rating"], product2["rating"]]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))

    ax1.bar(names, prices, color=["#4C72B0", "#DD8452"])
    ax1.set_title("Price Comparison")
    ax1.set_ylabel("Price (Rs.)")

    ax2.bar(names, ratings, color=["#4C72B0", "#DD8452"])
    ax2.set_title("Rating Comparison")
    ax2.set_ylabel("Rating")
    ax2.set_ylim(0, 5)

    fig.tight_layout()
    return fig


def get_top_rated_product():
    top_product = max(products, key=lambda x: x["rating"])
    return (
        f"Top Rated Product\n\n"
        f"Name: {top_product['name']}\n"
        f"Category: {top_product['category']}\n"
        f"Price: Rs.{top_product['price']}\n"
        f"Rating: {top_product['rating']}"
    )


def get_budget_product():
    cheapest = min(products, key=lambda x: x["price"])
    return (
        f"Best Budget Product\n\n"
        f"Name: {cheapest['name']}\n"
        f"Category: {cheapest['category']}\n"
        f"Price: Rs.{cheapest['price']}\n"
        f"Rating: {cheapest['rating']}"
    )


def category_recommendation(category):
    results = []
    for product in products:
        if product["category"].lower() == str(category).lower():
            results.append(
                f"\nName: {product['name']}\n"
                f"Price: Rs.{product['price']}\n"
                f"Rating: {product['rating']}\n"
            )
    return "\n".join(results) if results else "No products in this category."


def show_history():
    history_text = ""
    for item in chat_history:
        history_text += f"Question: {item['Question']}\nAnswer: {item['Answer']}\n\n"
    return history_text or "No conversations yet."


# ---------------- Block 10: Gradio UI ----------------
with gr.Blocks(theme=gr.themes.Soft(), title="AI Shopping Assistant") as demo:

    gr.Markdown("""
    # AI Shopping Assistant
    ### Powered by TinyLlama
    """)

    with gr.Tab("Product Assistant"):
        query = gr.Textbox(
            label="Customer Query",
            placeholder="Recommend a laptop under Rs.60000"
        )
        prompt_type = gr.Dropdown(
            choices=["zero_shot", "one_shot", "few_shot"],
            value="few_shot",
            label="Prompt Type"
        )
        submit_btn = gr.Button("Get Recommendation", variant="primary")
        output = gr.Textbox(label="AI Response", lines=10)
        submit_btn.click(fn=chatbot, inputs=[query, prompt_type], outputs=output)

    with gr.Tab("Product Comparison"):
        product1 = gr.Dropdown(
            choices=[p["name"] for p in products], label="Select Product 1"
        )
        product2 = gr.Dropdown(
            choices=[p["name"] for p in products], label="Select Product 2"
        )
        compare_btn = gr.Button("Compare Products", variant="primary")
        comparison_output = gr.Textbox(label="Comparison Result", lines=15)
        comparison_plot = gr.Plot(label="Comparison Charts")
        compare_btn.click(
            fn=compare_products,
            inputs=[product1, product2],
            outputs=[comparison_output, comparison_plot]
        )

    with gr.Tab("Smart Insights"):
        top_btn = gr.Button("Top Rated Product")
        budget_btn = gr.Button("Best Budget Product")
        insights_output = gr.Textbox(lines=12, label="Insights")
        top_btn.click(fn=get_top_rated_product, outputs=insights_output)
        budget_btn.click(fn=get_budget_product, outputs=insights_output)

    with gr.Tab("Categories"):
        category_dropdown = gr.Dropdown(
            choices=["Laptop", "Mobile", "Headphones"], label="Select Category"
        )
        category_btn = gr.Button("Show Products")
        category_output = gr.Textbox(lines=12, label="Products in Category")
        category_btn.click(
            fn=category_recommendation,
            inputs=category_dropdown,
            outputs=category_output
        )

    with gr.Tab("Chat History"):
        history_btn = gr.Button("Show History")
        history_output = gr.Textbox(lines=20, label="Conversation History")
        history_btn.click(fn=show_history, outputs=history_output)


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, share=True)
