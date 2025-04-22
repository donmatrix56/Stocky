import json
import requests
from bs4 import BeautifulSoup
import re
from typing import List, Dict, Any
from transformers import LlamaForCausalLM, LlamaTokenizer
import torch
import os

def match_stock_names(blocks: List[Any], json_file_path: str = "../Json/top_stocks.json") -> Dict[str, str]:
    """
    Loop through each block, find the tag name, and match it with a name from the JSON file.
    
    Args:
        blocks: List of blocks to analyze
        json_file_path: Path to the JSON file containing stock information
    
    Returns:
        Dictionary mapping tag names to corresponding stock names
    """
    # Load the JSON file
    try:
        with open(json_file_path, 'r') as file:
            stock_data = json.load(file)
    except FileNotFoundError:
        print(f"Error: The file {json_file_path} was not found.")
        return {}
    except json.JSONDecodeError:
        print(f"Error: The file {json_file_path} is not a valid JSON file.")
        return {}
    
    # Create a mapping from tag names to stock names
    stock_mapping = {}
    
    for block in blocks:
        # Assuming each block has a 'tag' attribute or similar
        tag_name = block.get('tag', '')
        
        # Find matching stock name in the JSON data
        for stock in stock_data:
            if stock.get('tag') == tag_name:
                stock_mapping[tag_name] = stock.get('name', '')
                break
    
    return stock_mapping

def find_top_news(stock_names: List[str], num_results: int = 10) -> Dict[str, List[Dict[str, str]]]:
    """
    Look through the internet to find the top news websites related to each stock name.
    
    Args:
        stock_names: List of stock names to search for
        num_results: Number of news results to retrieve per stock
    
    Returns:
        Dictionary mapping stock names to lists of news articles
    """
    news_results = {}
    
    for stock_name in stock_names:
        query = f"{stock_name} stock news"
        news_results[stock_name] = []
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(f"https://www.google.com/search?q={query}&tbm=nws", headers=headers)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract news articles
                articles = soup.select('div.g')[:num_results]
                
                for article in articles:
                    title_elem = article.select_one('h3')
                    link_elem = article.select_one('a')
                    
                    if title_elem and link_elem:
                        title = title_elem.get_text()
                        link = link_elem.get('href')
                        if link.startswith('/url?q='):
                            link = link.split('/url?q=')[1].split('&sa=')[0]
                        
                        news_results[stock_name].append({
                            'title': title,
                            'url': link
                        })
        except Exception as e:
            print(f"Error fetching news for {stock_name}: {e}")
    
    return news_results

def analyze_mood_with_llama(news_articles: Dict[str, List[Dict[str, str]]]) -> Dict[str, str]:
    """
    Use LLAMA to understand the mood of the company in relation to its stock price.
    
    Args:
        news_articles: Dictionary mapping stock names to lists of news articles
    
    Returns:
        Dictionary mapping stock names to mood analysis
    """
    mood_analysis = {}
    
    try:
        # Import libraries for LLAMA
        
        # Load LLAMA model and tokenizer
        model_name = "meta-llama/Llama-2-7b-chat-hf"
        tokenizer = LlamaTokenizer.from_pretrained(model_name)
        model = LlamaForCausalLM.from_pretrained(model_name, torch_dtype=torch.float16, device_map="auto")
        
        for stock_name, articles in news_articles.items():
            # Prepare the text for analysis
            titles = [article['title'] for article in articles]
            text_prompt = f"Analyze the following news headlines about {stock_name} and determine the overall sentiment regarding its stock price potential: {' '.join(titles)}"
            
            # Tokenize and generate
            inputs = tokenizer(text_prompt, return_tensors="pt").to(model.device)
            outputs = model.generate(
                inputs.input_ids,
                max_length=512,
                temperature=0.7,
                top_p=0.9,
                do_sample=True
            )
            
            # Decode the response
            response = tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Extract sentiment from the response
            mood_analysis[stock_name] = response
    except Exception as e:
        print(f"Error using LLAMA model: {e}")
        # Fallback to a placeholder
        for stock_name in news_articles:
            mood_analysis[stock_name] = "Neutral sentiment, insufficient data for analysis."
    
    return mood_analysis

def assign_sentiment_weight(mood_analysis: Dict[str, str]) -> Dict[str, int]:
    """
    Assign a weight between 1 and 5 based on the mood analysis.
    
    Args:
        mood_analysis: Dictionary mapping stock names to mood analysis
    
    Returns:
        Dictionary mapping stock names to sentiment weights (1-5)
    """
    sentiment_weights = {}
    
    # Define sentiment patterns and their corresponding weights
    sentiment_patterns = [
        (r'very\s+(?:negative|bearish|pessimistic|unfavorable)', 1),
        (r'(?:negative|bearish|pessimistic|unfavorable|decline|drop)', 2),
        (r'(?:neutral|balanced|stable|steady)', 3),
        (r'(?:positive|bullish|optimistic|favorable|growth|increase)', 4),
        (r'very\s+(?:positive|bullish|optimistic|favorable|strong)', 5)
    ]
    
    for stock_name, analysis in mood_analysis.items():
        # Default to neutral
        weight = 3
        
        # Check all patterns for the strongest match
        analysis_lower = analysis.lower()
        for pattern, value in sentiment_patterns:
            if re.search(pattern, analysis_lower):
                weight = value
                # If we find a very strong sentiment, prioritize it
                if value in [1, 5]:
                    break
        
        sentiment_weights[stock_name] = weight
    
    return sentiment_weights